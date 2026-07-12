import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationStore, createAndRegisterStore } from "../src/application-store";
import setupDevtools from "../src/devtools/setup-plugin";
import { AsyncModel, Model, registerModel } from "../src/models";
import { AsyncStore, Store } from "../src/stores";
import { createMockClient, resetRegistry, type MockHttpClient } from "./helpers";

const { setupDevtoolsPlugin } = vi.hoisted(() => ({ setupDevtoolsPlugin: vi.fn() }));

vi.mock("@vue/devtools-api", () => ({ setupDevtoolsPlugin }));

const INSPECTOR_ID = "data-store";

type InspectorNode = {
  id: string;
  label: string;
  children: Array<{ id: string; label: string }>;
};

type InspectorTreePayload = {
  inspectorId: string;
  filter: string;
  rootNodes: InspectorNode[];
};

type InspectorStatePayload = {
  inspectorId: string;
  nodeId: string;
  state: Record<string, Array<{ key: string; value: unknown; editable: boolean }>>;
};

type InspectorConfig = {
  id: string;
  actions: Array<{ tooltip: string; action: () => void }>;
};

type DevtoolsApi = {
  addInspector: (config: InspectorConfig) => void;
  on: {
    getInspectorTree: (handler: (payload: InspectorTreePayload) => void) => void;
    getInspectorState: (handler: (payload: InspectorStatePayload) => void) => void;
  };
  sendInspectorTree: (inspectorId: string) => void;
};

/**
 * Stand-in for the DevTools backend: records the handlers the plugin registers so
 * a test can drive them the way an open DevTools panel would.
 */
function createFakeDevtools() {
  const treeHandlers: Array<(payload: InspectorTreePayload) => void> = [];
  const stateHandlers: Array<(payload: InspectorStatePayload) => void> = [];
  const inspectors: InspectorConfig[] = [];
  const sendInspectorTree = vi.fn();

  const api: DevtoolsApi = {
    addInspector: (config) => {
      inspectors.push(config);
    },
    on: {
      getInspectorTree: (handler) => {
        treeHandlers.push(handler);
      },
      getInspectorState: (handler) => {
        stateHandlers.push(handler);
      },
    },
    sendInspectorTree,
  };

  return {
    api,
    sendInspectorTree,

    actions: () => inspectors.flatMap((inspector) => inspector.actions),

    requestTree: (filter = "") => {
      const payload: InspectorTreePayload = { inspectorId: INSPECTOR_ID, filter, rootNodes: [] };
      treeHandlers.forEach((handler) => handler(payload));

      return payload.rootNodes;
    },

    requestState: (nodeId: string) => {
      const payload: InspectorStatePayload = { inspectorId: INSPECTOR_ID, nodeId, state: {} };
      stateHandlers.forEach((handler) => handler(payload));

      return payload.state;
    },
  };
}

class UserModel extends AsyncModel {
  static readonly id = "users";
}
class PostModel extends Model {
  static readonly id = "posts";
}

/** `toString()` is the extension point DevTools uses for node labels, so it is user code that can throw. */
class ExplodingUserModel extends UserModel {
  toString(): string {
    throw new Error("toString exploded");
  }
}

class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";
}
class PostStore extends Store<PostModel> {
  static readonly id = "posts";
}

class AppStore extends ApplicationStore {
  declare readonly users: UserStore;
  declare readonly posts: PostStore;
}

async function setupWithFakeDevtools(appStore: AppStore) {
  const devtools = createFakeDevtools();

  setupDevtoolsPlugin.mockImplementation(
    (_descriptor: unknown, setup: (api: DevtoolsApi) => void) => setup(devtools.api),
  );

  await setupDevtools({ config: { globalProperties: { store: appStore } } });

  return devtools;
}

describe("devtools plugin", () => {
  let client: MockHttpClient;

  beforeEach(() => {
    resetRegistry();
    registerModel(UserModel);
    registerModel(PostModel);
    client = createMockClient();
    setupDevtoolsPlugin.mockReset();
  });

  it("leaves the HTTP client on the application store", async () => {
    const { appStore } = createAndRegisterStore(AppStore, [UserStore, PostStore], client);

    await setupWithFakeDevtools(appStore);

    expect(appStore.client).toBe(client);
  });

  it("lists both sync and async stores as inspector root nodes", async () => {
    const { appStore } = createAndRegisterStore(AppStore, [UserStore, PostStore], client);
    appStore.users._pushRecord(new UserModel({ id: "u1" }));
    appStore.posts._pushRecord(new PostModel({ id: "p1" }));

    const devtools = await setupWithFakeDevtools(appStore);
    const rootNodes = devtools.requestTree();

    expect(rootNodes.map((node) => node.id)).toEqual(["users", "posts"]);
    expect(rootNodes.map((node) => node.label)).toEqual(["Users (1)", "Posts (1)"]);
  });

  it("ignores non-store properties on the application store", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
    appStore.settings = { theme: "dark" };
    appStore.version = "1.0.0";
    appStore.session = null;

    const devtools = await setupWithFakeDevtools(appStore);

    expect(devtools.requestTree().map((node) => node.id)).toEqual(["users"]);
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("exposes a selected record's state", async () => {
    const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
    appStore.users._pushRecord(new UserModel({ id: "u1" }));

    const devtools = await setupWithFakeDevtools(appStore);
    const state = devtools.requestState("u1");

    expect(state.Record).toContainEqual({ key: "id", value: "u1", editable: false });
  });

  describe("filtering", () => {
    it("narrows the children to records matching the search filter", async () => {
      const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
      appStore.users._pushRecord(new UserModel({ id: "u1" }));
      appStore.users._pushRecord(new UserModel({ id: "other" }));

      const devtools = await setupWithFakeDevtools(appStore);
      const [users] = devtools.requestTree("u1");

      expect(users.children.map((child) => child.id)).toEqual(["u1"]);
    });

    it("searches records that have no id without dropping the store", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
      appStore.users._pushRecord(new UserModel({ id: "u1" }));
      appStore.users._pushRecord(new UserModel({}));

      const devtools = await setupWithFakeDevtools(appStore);
      const rootNodes = devtools.requestTree("u1");

      expect(rootNodes.map((node) => node.id)).toEqual(["users"]);
      expect(rootNodes[0].children.map((child) => child.id)).toEqual(["u1"]);
      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("keeps the rest of the tree when one store's records throw", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const { appStore } = createAndRegisterStore(AppStore, [UserStore, PostStore], client);
      appStore.users._pushRecord(new ExplodingUserModel({ id: "u1" }));
      appStore.posts._pushRecord(new PostModel({ id: "p1" }));

      const devtools = await setupWithFakeDevtools(appStore);

      expect(devtools.requestTree().map((node) => node.id)).toEqual(["posts"]);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("hides every record when both toggles are off", async () => {
      vi.useFakeTimers();
      const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
      appStore.users._pushRecord(new UserModel({ id: "u1" }));
      appStore.users._pushRecord(new UserModel({}));

      const devtools = await setupWithFakeDevtools(appStore);
      devtools.actions().forEach((action) => action.action());
      await vi.advanceTimersByTimeAsync(50);

      const [users] = devtools.requestTree();

      expect(users.label).toBe("Users (2)");
      expect(users.children).toEqual([]);

      vi.useRealTimers();
    });
  });
});
