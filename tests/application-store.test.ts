import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "vue";
import {
  ApplicationStore,
  createAndRegisterStore,
  createStore,
  KITA_STORE_KEY,
} from "../src/application-store";
import registry from "../src/model-store-registry";
import { AsyncModel, Model, registerModel } from "../src/models";
import { AsyncStore, Store } from "../src/stores";
import { createMockClient, resetRegistry, type MockHttpClient } from "./helpers";

/**
 * Build a minimal Vue App-shaped object that satisfies the install() contract
 * without requiring a DOM. We only assert on the side effects of `install`.
 */
function createFakeVueApp(): {
  provide: ReturnType<typeof vi.fn>;
  use: ReturnType<typeof vi.fn>;
  config: { globalProperties: Record<string, unknown> };
} {
  return {
    provide: vi.fn(),
    use: vi.fn(),
    config: { globalProperties: {} },
  };
}

class UserModel extends AsyncModel {
  static readonly id = "users";
}
class PostModel extends Model {
  static readonly id = "posts";
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

describe("ApplicationStore", () => {
  let client: MockHttpClient;

  beforeEach(() => {
    resetRegistry();
    registerModel(UserModel);
    registerModel(PostModel);
    client = createMockClient();
  });

  describe("createStore", () => {
    it("returns an appStore instance and a useStore inject helper", () => {
      const { appStore, useStore } = createStore(AppStore, client);
      expect(appStore).toBeInstanceOf(AppStore);
      expect(typeof useStore).toBe("function");
    });

    it("passes the client through to the app store", () => {
      const { appStore } = createStore(AppStore, client);
      expect(appStore.client).toBe(client);
    });
  });

  describe("createAndRegisterStore", () => {
    it("registers every child store on the app store + global registry", () => {
      const { appStore } = createAndRegisterStore(AppStore, [UserStore, PostStore], client);
      expect(appStore.users).toBeInstanceOf(UserStore);
      expect(appStore.posts).toBeInstanceOf(PostStore);
      expect(registry.getStore("users")).toBe(appStore.users);
      expect(registry.getStore("posts")).toBe(appStore.posts);
    });

    it("works with an empty store list", () => {
      const { appStore } = createAndRegisterStore(AppStore, [], client);
      expect(appStore).toBeInstanceOf(AppStore);
    });
  });

  describe("registerStore", () => {
    it("attaches the store at the static id key", () => {
      const { appStore } = createStore(AppStore, client);
      appStore.registerStore(UserStore);
      expect(appStore.users).toBeInstanceOf(UserStore);
    });

    it("getStore retrieves by record type", () => {
      const { appStore } = createStore(AppStore, client);
      appStore.registerStore(UserStore);
      expect(appStore.getStore("users")).toBe(appStore.users);
    });

    it("returns this for chaining", () => {
      const { appStore } = createStore(AppStore, client);
      const result = appStore.registerStore(UserStore);
      expect(result).toBe(appStore);
    });
  });

  describe("Vue plugin (install)", () => {
    it("calls app.provide(KITA_STORE_KEY, appStore)", () => {
      const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
      const fakeApp = createFakeVueApp();

      appStore.install(fakeApp as unknown as App);

      expect(fakeApp.provide).toHaveBeenCalledWith(KITA_STORE_KEY, appStore);
    });

    it("attaches the store to app.config.globalProperties", () => {
      const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
      const fakeApp = createFakeVueApp();

      appStore.install(fakeApp as unknown as App);

      expect(fakeApp.config.globalProperties.store).toBe(appStore);
    });

    it("registers the devtools plugin via app.use", () => {
      const { appStore } = createAndRegisterStore(AppStore, [UserStore], client);
      const fakeApp = createFakeVueApp();

      appStore.install(fakeApp as unknown as App);

      expect(fakeApp.use).toHaveBeenCalledTimes(1);
    });
  });
});
