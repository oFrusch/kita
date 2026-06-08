import { beforeEach, describe, expect, it } from "vitest";
import registry from "../src/model-store-registry";
import { AsyncModel, registerModel } from "../src/models";
import { AsyncStore } from "../src/stores";
import { createMockClient, mockResponse, resetRegistry, type MockHttpClient } from "./helpers";

class UserModel extends AsyncModel {
  static readonly id = "users";
  declare email: string;
}

class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";
}

describe("AsyncStore", () => {
  let client: MockHttpClient;
  let store: UserStore;

  beforeEach(() => {
    resetRegistry();
    registerModel(UserModel);
    client = createMockClient();
    store = new UserStore(client, {});
    registry.registerStore("users", store);
  });

  describe("APIUrl derivation", () => {
    it("auto-derives /users/ from the static id", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");
      expect(client.get).toHaveBeenCalledWith("/users/1/", { params: {} });
    });

    it("snake-cases camelCase ids (placeTags → place_tags)", async () => {
      class PlaceTagModel extends AsyncModel {
        static readonly id = "placeTags";
      }
      class PlaceTagStore extends AsyncStore<PlaceTagModel> {
        static readonly id = "placeTags";
      }
      registerModel(PlaceTagModel);
      const tagStore = new PlaceTagStore(client, {});
      registry.registerStore("placeTags", tagStore);

      client.get.mockResolvedValue(mockResponse({ id: "1" }));
      await tagStore.findRecord("1");
      expect(client.get).toHaveBeenCalledWith("/place_tags/1/", { params: {} });
    });

    it("honors APIUrl override from constructor args", async () => {
      class Custom extends AsyncStore<UserModel> {
        static readonly id = "users";
      }
      const custom = new Custom(client, { APIUrl: "custom_endpoint" });
      client.get.mockResolvedValue(mockResponse({ id: "1" }));
      await custom.findRecord("1");
      expect(client.get).toHaveBeenCalledWith("/custom_endpoint/1/", { params: {} });
    });
  });

  describe("findRecord", () => {
    it("fetches and caches on first call", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a@b.com" }));
      const user = await store.findRecord("1");
      expect(client.get).toHaveBeenCalledTimes(1);
      expect(user?.id).toBe("1");
      expect(store.peekRecord("1")).toBe(user);
    });

    it("returns cached record without re-fetching", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a@b.com" }));
      await store.findRecord("1");
      await store.findRecord("1");
      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it("refetches when revalidate=true is passed", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a@b.com" }));
      await store.findRecord("1");
      await store.findRecord("1", {}, true);
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("deduplicates concurrent fetches for the same id", async () => {
      let resolve!: (v: unknown) => void;
      client.get.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );

      const p1 = store.findRecord("1");
      const p2 = store.findRecord("1");
      resolve(mockResponse({ id: "1", email: "x" }));
      const [a, b] = await Promise.all([p1, p2]);

      expect(a).toBe(b);
      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it("passes query params through to the request", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "x" }));
      await store.findRecord("1", { include: "posts" });
      expect(client.get).toHaveBeenCalledWith("/users/1/", { params: { include: "posts" } });
    });
  });

  describe("findRecords", () => {
    it("returns an array response and undefined meta when API returns a bare array", async () => {
      client.get.mockResolvedValue(
        mockResponse([
          { id: "1", email: "a" },
          { id: "2", email: "b" },
        ]),
      );
      const { records, meta } = await store.findRecords();
      expect(records).toHaveLength(2);
      expect(meta).toBeUndefined();
    });

    it("extracts data + meta from a paginated response shape", async () => {
      client.get.mockResolvedValue(
        mockResponse({
          data: [{ id: "1", email: "a" }],
          meta: { page: 1, totalPages: 5 },
        }),
      );
      const { records, meta } = await store.findRecords({ page: 1 });
      expect(records).toHaveLength(1);
      expect(meta).toEqual({ page: 1, totalPages: 5 });
    });

    it("caches results by params and skips the second call", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });
      await store.findRecords({ q: "x" });
      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it("skips the cache when replaceStore is true", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });
      await store.findRecords({ q: "x" }, { replaceStore: true });
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("skips the cache when cache=false", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });
      await store.findRecords({ q: "x" }, { cache: false });
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("legacy boolean second arg maps to replaceStore", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });
      await store.findRecords({ q: "x" }, true);
      expect(client.get).toHaveBeenCalledTimes(2);
    });
  });

  describe("save / delete", () => {
    it("save() POSTs the serialized body when the record is new", async () => {
      const draft = UserModel.create({ email: "a@b.com" });
      client.post.mockResolvedValue(mockResponse({ id: "1", email: "a@b.com" }));

      await store.save(draft);

      expect(client.post).toHaveBeenCalledWith("/users/", expect.any(String));
      expect(client.put).not.toHaveBeenCalled();
      expect(store.peekRecord("1")).toBeDefined();
    });

    it("save() PUTs to /<id>/ when the record already has an id", async () => {
      const m = UserModel.create({ id: "1", email: "old" });
      client.put.mockResolvedValue(mockResponse({ id: "1", email: "new" }));

      const result = await store.save(m);

      expect(client.put).toHaveBeenCalledWith("/users/1/", expect.any(String));
      expect(client.post).not.toHaveBeenCalled();
      expect(result.email).toBe("new");
    });

    it("delete() DELETEs and removes the record from the store", async () => {
      const m = UserModel.create({ id: "1", email: "x" });
      client.delete.mockResolvedValue(mockResponse({}));

      await store.delete(m);

      expect(client.delete).toHaveBeenCalledWith("/users/1/");
      expect(store.peekRecord("1")).toBeUndefined();
    });

    it("delete() on a new record (no id) just removes locally (no DELETE)", async () => {
      const m = UserModel.create({ email: "x" });

      await store.delete(m);

      expect(client.delete).not.toHaveBeenCalled();
    });
  });

  describe("queryCache auto-invalidation on mutations", () => {
    it("invalidates the query cache after creating a record", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });

      client.post.mockResolvedValue(mockResponse({ id: "2", email: "b" }));
      await store.save(UserModel.create({ email: "b" }));

      await store.findRecords({ q: "x" });
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("invalidates the query cache after updating a record", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });

      const m = UserModel.create({ id: "1", email: "a" });
      client.put.mockResolvedValue(mockResponse({ id: "1", email: "z" }));
      await store.save(m);

      await store.findRecords({ q: "x" });
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("invalidates the query cache after deleting a record", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });

      const m = UserModel.create({ id: "1", email: "a" });
      client.delete.mockResolvedValue(mockResponse({}));
      await store.delete(m);

      await store.findRecords({ q: "x" });
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("invalidateQueries with a predicate only clears matching entries", async () => {
      client.get.mockResolvedValue(mockResponse([]));
      await store.findRecords({ category: "A" });
      await store.findRecords({ category: "B" });

      store.invalidateQueries((params) => params.category === "A");

      await store.findRecords({ category: "A" });
      await store.findRecords({ category: "B" });

      // 2 initial + 1 refetch (A) + 0 (B still cached) = 3
      expect(client.get).toHaveBeenCalledTimes(3);
    });
  });

  describe("optimistic mutations", () => {
    it("optimisticUpdate applies changes immediately and syncs on success", async () => {
      const m = UserModel.create({ id: "1", email: "old" });
      // `new` bypasses _pushRecord so we can pass a "patch" instance with .serialize()
      // without overwriting the stored record before the optimistic flow runs.
      const patch = new UserModel({ id: "1", email: "new" });
      client.put.mockResolvedValue(mockResponse({ id: "1", email: "new" }));

      await store.optimisticUpdate(patch);

      expect(m.email).toBe("new");
    });

    it("optimisticUpdate rolls back on server error", async () => {
      const m = UserModel.create({ id: "1", email: "old" });
      const patch = new UserModel({ id: "1", email: "new" });
      client.put.mockRejectedValue(new Error("server down"));

      await expect(store.optimisticUpdate(patch)).rejects.toThrow("server down");
      expect(m.email).toBe("old");
    });

    it("optimisticDelete removes immediately and restores on error", async () => {
      const m = UserModel.create({ id: "1", email: "x" });
      client.delete.mockRejectedValue(new Error("denied"));

      await expect(store.optimisticDelete(m)).rejects.toThrow("denied");
      expect(store.peekRecord("1")).toBeDefined();
    });

    it("optimisticCreate adds a temp record and replaces on success", async () => {
      client.post.mockResolvedValue(mockResponse({ id: "real-1", email: "a" }));

      const draft = UserModel.create({ email: "a" });
      await store.optimisticCreate(draft);

      expect(store.peekRecord("real-1")).toBeDefined();
    });

    it("optimisticCreate removes the temp record on server error", async () => {
      client.post.mockRejectedValue(new Error("bad"));

      const draft = UserModel.create({ email: "a" });
      await expect(store.optimisticCreate(draft)).rejects.toThrow("bad");

      // The records array should not contain a `temp_...`-id record after rollback
      const tempRecord = store.records.find((r) => r.id?.startsWith?.("temp_"));
      expect(tempRecord).toBeUndefined();
    });
  });

  describe("createPaginatedQuery", () => {
    it("wraps findRecords behind a PaginatedQuery", async () => {
      client.get.mockResolvedValue(
        mockResponse({
          data: [{ id: "1", email: "a" }],
          meta: { page: 1, totalPages: 1, totalCount: 1, hasMore: false },
        }),
      );

      const q = store.createPaginatedQuery({ filter: "x" });
      const records = await q.loadMore();

      expect(records).toHaveLength(1);
      expect(q.hasMore).toBe(false);
      expect(q.totalCount).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears records, lookup, query cache, and dedup tracker", async () => {
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));
      await store.findRecords({ q: "x" });
      expect(store.records).toHaveLength(1);

      (store as any).reset();
      expect(store.records).toHaveLength(0);

      await store.findRecords({ q: "x" });
      expect(client.get).toHaveBeenCalledTimes(2); // cache was cleared
    });
  });
});
