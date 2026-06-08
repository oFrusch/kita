import { beforeEach, describe, expect, it } from "vitest";
import registry from "../src/model-store-registry";
import { AsyncModel, Model, registerModel } from "../src/models";
import { AsyncStore, Store } from "../src/stores";
import { createMockClient, mockResponse, resetRegistry } from "./helpers";

describe("AbstractModel", () => {
  beforeEach(resetRegistry);

  it("assigns params to the instance via the constructor", () => {
    class M extends Model {
      static readonly id = "m";
      declare name: string;
    }
    const m = M.create({ id: "1", name: "test" });
    expect(m.id).toBe("1");
    expect(m.name).toBe("test");
  });

  it("toString returns the id", () => {
    class M extends Model {
      static readonly id = "m";
    }
    const m = M.create({ id: "abc" });
    expect(m.toString()).toBe("abc");
  });

  it("serialize excludes store + stores keys", () => {
    class M extends Model {
      static readonly id = "m";
      declare name: string;
    }
    const m = M.create({ id: "1", name: "test" });
    (m as any).store = { whatever: true };

    const json = JSON.parse(m.serialize());
    expect(json.id).toBe("1");
    expect(json.name).toBe("test");
    expect(json.store).toBeUndefined();
    expect(json.stores).toBeUndefined();
  });

  it("serialize accepts an additional list of keys to exclude", () => {
    class M extends Model {
      static readonly id = "m";
    }
    const m = M.create({ id: "1", secret: "xxx", visible: "yes" });
    const json = JSON.parse(m.serialize(["secret"]));
    expect(json.secret).toBeUndefined();
    expect(json.visible).toBe("yes");
  });
});

describe("Model.isNew", () => {
  it("is true when no id is set", () => {
    class M extends Model {
      static readonly id = "m";
    }
    const m = M.create({});
    expect(m.isNew).toBe(true);
  });

  it("is false when id is set", () => {
    class M extends Model {
      static readonly id = "m";
    }
    const m = M.create({ id: "1" });
    expect(m.isNew).toBe(false);
  });
});

describe("AsyncModel", () => {
  class UserModel extends AsyncModel {
    static readonly id = "users";
    declare email: string;
  }

  class UserStore extends AsyncStore<UserModel> {
    static readonly id = "users";
  }

  let client: ReturnType<typeof createMockClient>;
  let store: UserStore;

  beforeEach(() => {
    resetRegistry();
    registerModel(UserModel);
    client = createMockClient();
    store = new UserStore(client, {});
    registry.registerStore("users", store);
  });

  it("create() pushes the new record into its store automatically", () => {
    const u = UserModel.create({ id: "1", email: "a@b.com" });
    expect(store.peekRecord("1")).toBe(u);
  });

  it("save() POSTs when the record is new", async () => {
    const u = UserModel.create({ email: "a@b.com" });
    client.post.mockResolvedValue(mockResponse({ id: "1", email: "a@b.com" }));
    await u.save();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.put).not.toHaveBeenCalled();
    expect(u.id).toBe("1");
  });

  it("save() PUTs when the record already has an id", async () => {
    const u = UserModel.create({ id: "1", email: "old@x.com" });
    client.put.mockResolvedValue(mockResponse({ id: "1", email: "new@x.com" }));
    await u.save();
    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.post).not.toHaveBeenCalled();
    expect(u.email).toBe("new@x.com");
  });

  it("delete() DELETEs when the record has an id", async () => {
    const u = UserModel.create({ id: "1", email: "a@b.com" });
    client.delete.mockResolvedValue(mockResponse({}));
    await u.delete();
    expect(client.delete).toHaveBeenCalledWith("/users/1/");
    expect(store.peekRecord("1")).toBeUndefined();
  });

  it("delete() on a new record only removes locally (no DELETE)", async () => {
    const u = UserModel.create({ email: "a@b.com" });
    await u.delete();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("update(patch) applies the patch then saves", async () => {
    const u = UserModel.create({ id: "1", email: "old@x.com" });
    client.put.mockResolvedValue(mockResponse({ id: "1", email: "new@x.com" }));

    await u.update({ email: "new@x.com" });

    expect(client.put).toHaveBeenCalledWith("/users/1/", expect.any(String));
    expect(u.email).toBe("new@x.com");
  });

  it("save() throws when no store is associated", async () => {
    const orphan = new UserModel({ email: "x" });
    await expect(orphan.save()).rejects.toThrow();
  });
});

describe("registerModel", () => {
  beforeEach(resetRegistry);

  it("adds the model class to the registry", () => {
    class M extends Model {
      static readonly id = "x";
    }
    registerModel(M);
    expect(registry.getModel("x")).toBe(M);
  });

  it("static block usage registers on class definition", () => {
    class M extends Model {
      static readonly id = "y";
      static {
        registerModel(this);
      }
    }
    // touch M so the static block runs
    void M;
    expect(registry.getModel("y")).toBe(M);
  });
});

describe("Store (sync)", () => {
  class ItemModel extends Model {
    static readonly id = "items";
    declare name: string;
  }
  class ItemStore extends Store<ItemModel> {
    static readonly id = "items";
  }

  let store: ItemStore;

  beforeEach(() => {
    resetRegistry();
    store = new ItemStore();
  });

  it("_pushRecord adds a new record to records + lookup map", () => {
    const m = ItemModel.create({ id: "1", name: "a" });
    store._pushRecord(m);
    expect(store.records).toHaveLength(1);
    expect(store.findRecord("1")).toBe(m);
  });

  it("_pushRecord merges into the existing record when one already exists", () => {
    const original = ItemModel.create({ id: "1", name: "a" });
    store._pushRecord(original);

    const incoming = ItemModel.create({ id: "1", name: "b" });
    const result = store._pushRecord(incoming);

    expect(result).toBe(original);
    expect(store.records).toHaveLength(1);
    expect(original.name).toBe("b");
  });

  it("peekRecord returns by id without fetching", () => {
    const m = ItemModel.create({ id: "1", name: "a" });
    store._pushRecord(m);
    expect(store.peekRecord("1")).toBe(m);
    expect(store.peekRecord("missing")).toBeUndefined();
  });

  it("_removeRecord removes by id", () => {
    const m = ItemModel.create({ id: "1", name: "a" });
    store._pushRecord(m);
    store._removeRecord(m);
    expect(store.records).toHaveLength(0);
    expect(store.findRecord("1")).toBeUndefined();
  });

  it("_deleteRecord removes by id", () => {
    const m = ItemModel.create({ id: "1", name: "a" });
    store._pushRecord(m);
    store._deleteRecord(m);
    expect(store.records).toHaveLength(0);
  });

  it("_updateRecord delegates to _pushRecord (merge or insert)", () => {
    const m = ItemModel.create({ id: "1", name: "a" });
    const result = store._updateRecord(m);
    expect(result).toBe(m);
    expect(store.findRecord("1")).toBe(m);
  });

  it("reset clears records, lookup map, and state", () => {
    store._pushRecord(ItemModel.create({ id: "1", name: "a" }));
    store._pushRecord(ItemModel.create({ id: "2", name: "b" }));
    (store as any).reset();
    expect(store.records).toHaveLength(0);
    expect(store.findRecord("1")).toBeUndefined();
  });
});
