import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effect, toRaw } from "vue";

import registry from "../src/model-store-registry";
import { AsyncModel, registerModel } from "../src/models";
import { AsyncStore } from "../src/stores";
import {
  createMockClient,
  deferred,
  mockResponse,
  resetRegistry,
  type MockHttpClient,
} from "./helpers";

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

  describe("peekRecord reactivity (regression)", () => {
    // Must assert through a tracked computed — a direct peekRecord read always
    // sees fresh state and can't catch a computed caching a miss forever.
    it("invalidates a computed that peeked a not-yet-cached record once it's pushed", () => {
      const id = "1";
      const peeked = computed(() => store.peekRecord(id));

      expect(peeked.value).toBeUndefined();

      const user = UserModel.create({ id, email: "a@b.com" });
      store._pushRecord(user);

      expect(peeked.value).toBe(user);
    });

    it("leaves a computed peeking a different absent id unaffected", () => {
      const peekedA = computed(() => store.peekRecord("a"));
      const peekedB = computed(() => store.peekRecord("b"));

      expect(peekedA.value).toBeUndefined();
      expect(peekedB.value).toBeUndefined();

      const userA = UserModel.create({ id: "a", email: "a@b.com" });
      store._pushRecord(userA);

      expect(peekedA.value).toBe(userA);
      expect(peekedB.value).toBeUndefined();
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

    it("returns meta on a cache hit, not just on the first fetch (regression)", async () => {
      client.get.mockResolvedValue(
        mockResponse({
          data: [{ id: "1", email: "a" }],
          meta: { page: 2, totalPages: 5, totalCount: 50, hasMore: true },
        }),
      );

      const first = await store.findRecords({ page: 2 });
      expect(first.meta).toEqual({ page: 2, totalPages: 5, totalCount: 50, hasMore: true });

      // Second call is served from cache — meta must survive the round-trip.
      const cached = await store.findRecords({ page: 2 });
      expect(client.get).toHaveBeenCalledTimes(1);
      expect(cached.meta).toEqual(first.meta);
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

    it("honors a cacheTTL longer than the cache default across an unrelated write", async () => {
      vi.useFakeTimers();
      client.get.mockResolvedValue(mockResponse([{ id: "1", email: "a" }]));

      await store.findRecords({ page: 1 }, { cacheTTL: 300_000 });
      expect(client.get).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(70_000);
      await store.findRecords({ page: 2 });
      expect(client.get).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(10_000);
      await store.findRecords({ page: 1 }, { cacheTTL: 300_000 });
      expect(client.get).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
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

    it("optimisticDelete removes the record on success", async () => {
      const m = UserModel.create({ id: "1", email: "x" });
      client.delete.mockResolvedValue(mockResponse({}));

      await store.optimisticDelete(m);

      expect(store.peekRecord("1")).toBeUndefined();
      expect(store.records.map((r) => r.id)).toEqual([]);
    });

    it("optimisticDelete restores the original model instance on error", async () => {
      const m = UserModel.create({ id: "1", email: "x" });
      client.delete.mockRejectedValue(new Error("denied"));

      await expect(store.optimisticDelete(m)).rejects.toThrow("denied");

      const restored = store.peekRecord("1");

      expect(restored).toBe(m);
      expect(restored).toBeInstanceOf(UserModel);
      expect(typeof restored?.save).toBe("function");
    });

    it("optimisticDelete restores the record at its original position", async () => {
      UserModel.create({ id: "1", email: "a" });
      const middle = UserModel.create({ id: "2", email: "b" });
      UserModel.create({ id: "3", email: "c" });
      client.delete.mockRejectedValue(new Error("denied"));

      await expect(store.optimisticDelete(middle)).rejects.toThrow("denied");

      expect(store.records.map((r) => r.id)).toEqual(["1", "2", "3"]);
      // `records` is a Vue ref, so entries read back as reactive proxies of the model.
      expect(toRaw(store.records[1])).toBe(middle);
    });

    it("optimisticDelete restores the position after the array was already rebuilt", async () => {
      UserModel.create({ id: "1", email: "a" });
      const middle = UserModel.create({ id: "2", email: "b" });
      UserModel.create({ id: "3", email: "c" });
      const doomed = UserModel.create({ id: "4", email: "d" });

      store._removeRecord(doomed);

      client.delete.mockRejectedValue(new Error("denied"));

      await expect(store.optimisticDelete(middle)).rejects.toThrow("denied");

      expect(store.records.map((r) => r.id)).toEqual(["1", "2", "3"]);
      expect(toRaw(store.records[1])).toBe(middle);
    });

    it("optimisticDelete appends a record that was never in the array", async () => {
      UserModel.create({ id: "1", email: "a" });
      UserModel.create({ id: "2", email: "b" });

      const absent = new UserModel({ id: "9", email: "z" });
      client.delete.mockRejectedValue(new Error("denied"));

      await expect(store.optimisticDelete(absent)).rejects.toThrow("denied");

      expect(store.records.map((r) => r.id)).toEqual(["1", "2", "9"]);
      expect(store.peekRecord("9")).toBe(absent);
    });

    it("optimisticDelete appends the record when the array shrank mid-flight", async () => {
      const first = UserModel.create({ id: "1", email: "a" });
      const middle = UserModel.create({ id: "2", email: "b" });
      const last = UserModel.create({ id: "3", email: "c" });

      let rejectDelete = (_error: Error) => {};
      client.delete.mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectDelete = reject;
        }),
      );

      const pending = store.optimisticDelete(middle);

      expect(store.records.map((r) => r.id)).toEqual(["1", "3"]);

      store._removeRecord(first);
      store._removeRecord(last);

      rejectDelete(new Error("denied"));

      await expect(pending).rejects.toThrow("denied");

      expect(store.records.map((r) => r.id)).toEqual(["2"]);
      expect(toRaw(store.records[0])).toBe(middle);
      expect(store.peekRecord("2")).toBe(middle);
    });
  });

  describe("optimisticCreate", () => {
    it("holds the original model instance in the store while the POST is in flight", async () => {
      const post = deferred();
      client.post.mockReturnValue(post.promise);

      const draft = UserModel.create({ email: "a@b.com" });
      const created = store.optimisticCreate(draft);

      // Observed synchronously: the pending record is the draft itself, not a clone.
      expect(store.records).toHaveLength(1);
      expect(toRaw(store.records[0])).toBe(draft);
      expect(store.records[0]).toBeInstanceOf(UserModel);
      expect(store.peekRecord(draft.id)).toBe(draft);

      post.resolve(mockResponse({ id: "real-1", email: "a@b.com" }));
      await created;
    });

    it("keeps model methods and getters alive on the pending record", async () => {
      const post = deferred();
      client.post.mockReturnValue(post.promise);

      const draft = UserModel.create({ email: "a@b.com" });
      const created = store.optimisticCreate(draft);
      const pending = store.records[0];

      expect(pending.save).toBeTypeOf("function");
      expect(pending.delete).toBeTypeOf("function");
      // A plain-object clone would report `undefined` here, not a boolean. False
      // because the pending record carries the temporary id — which is also why
      // `save()` / `delete()` are off-limits until the create settles.
      expect(pending.isNew).toBe(false);

      post.resolve(mockResponse({ id: "real-1", email: "a@b.com" }));
      await created;
    });

    it("never leaks the temporary id into the POST body", async () => {
      client.post.mockResolvedValue(mockResponse({ id: "real-1", email: "a@b.com" }));

      await store.optimisticCreate(UserModel.create({ email: "a@b.com" }));

      const [url, body] = client.post.mock.calls[0];
      expect(url).toBe("/users/");
      expect(body).not.toContain("temp_");
      expect(JSON.parse(body)).toEqual({ email: "a@b.com" });
    });

    it("leaves exactly one entry, keyed by the server id, on success", async () => {
      client.post.mockResolvedValue(mockResponse({ id: "real-1", email: "a@b.com" }));

      const draft = UserModel.create({ email: "a@b.com" });
      const create = store.optimisticCreate(draft);
      const temporaryId = draft.id;

      const result = await create;

      expect(result).toBe(draft);
      expect(store.peekRecord("real-1")).toBe(draft);
      expect(store.peekRecord(temporaryId)).toBeUndefined();
      expect(store.records).toHaveLength(1);
      expect(store.records.filter((r) => toRaw(r) === draft)).toHaveLength(1);
    });

    it("rolls the record and its original id back on server error", async () => {
      client.post.mockRejectedValue(new Error("bad"));

      const draft = UserModel.create({ email: "a@b.com" });
      const create = store.optimisticCreate(draft);
      const temporaryId = draft.id;

      expect(temporaryId).toMatch(/^temp_/);
      await expect(create).rejects.toThrow("bad");

      expect(store.records).toHaveLength(0);
      expect(store.peekRecord(temporaryId)).toBeUndefined();
      expect(draft.id).toBeUndefined();
      expect(draft.isNew).toBe(true);
    });

    it("gives concurrent creates distinct temporary ids", async () => {
      const first = deferred();
      const second = deferred();
      client.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      const draftA = UserModel.create({ email: "a@b.com" });
      const draftB = UserModel.create({ email: "b@b.com" });
      const creates = Promise.all([store.optimisticCreate(draftA), store.optimisticCreate(draftB)]);

      expect(draftA.id).not.toBe(draftB.id);
      expect(store.records).toHaveLength(2);
      expect(toRaw(store.records[0])).toBe(draftA);
      expect(toRaw(store.records[1])).toBe(draftB);
      expect(store.peekRecord(draftA.id)).toBe(draftA);
      expect(store.peekRecord(draftB.id)).toBe(draftB);

      first.resolve(mockResponse({ id: "real-1", email: "a@b.com" }));
      second.resolve(mockResponse({ id: "real-2", email: "b@b.com" }));
      await creates;

      expect(store.records).toHaveLength(2);
      expect(store.peekRecord("real-1")).toBe(draftA);
      expect(store.peekRecord("real-2")).toBe(draftB);
    });

    it("re-renders with the server id once the create lands", async () => {
      const post = deferred();
      client.post.mockReturnValue(post.promise);

      const draft = UserModel.create({ email: "a@b.com" });

      // Asserting on `records` / `peekRecord` cannot catch a missing reactive
      // trigger: both read fresh values straight off the instance. Only a
      // tracked effect sees whether a component would actually redraw.
      let rendered: string[] = [];
      effect(() => {
        rendered = store.records.map((r) => r.id);
      });

      expect(rendered).toEqual([]);

      const created = store.optimisticCreate(draft);
      expect(rendered).toEqual([draft.id]);

      post.resolve(mockResponse({ id: "real-1", email: "a@b.com" }));
      await created;

      expect(rendered).toEqual(["real-1"]);
    });

    it("shares the in-flight request between re-entrant creates of one instance", async () => {
      const post = deferred();
      client.post.mockReturnValue(post.promise);

      const draft = UserModel.create({ email: "a@b.com" });
      const both = Promise.all([store.optimisticCreate(draft), store.optimisticCreate(draft)]);

      expect(client.post).toHaveBeenCalledTimes(1);
      expect(store.records).toHaveLength(1);

      post.resolve(mockResponse({ id: "real-1", email: "a@b.com" }));
      const [first, second] = await both;

      expect(first).toBe(draft);
      expect(second).toBe(draft);
      expect(store.records).toHaveLength(1);
      expect(JSON.parse(client.post.mock.calls[0][1])).toEqual({ email: "a@b.com" });
    });

    it("merges into the incumbent when the server returns an id already in the store", async () => {
      client.post.mockResolvedValue(mockResponse({ id: "5", email: "server@b.com" }));

      const existing = UserModel.create({ id: "5", email: "existing@b.com" });
      const draft = UserModel.create({ email: "a@b.com" });

      const created = await store.optimisticCreate(draft);

      expect(store.records).toHaveLength(1);
      expect(created).toBe(existing);
      expect(store.peekRecord("5")).toBe(existing);
      expect(existing.email).toBe("server@b.com");
    });

    it("rolls back exactly once when a re-entrant create fails", async () => {
      const post = deferred();
      client.post.mockReturnValue(post.promise);

      const draft = UserModel.create({ email: "a@b.com" });
      const both = Promise.allSettled([
        store.optimisticCreate(draft),
        store.optimisticCreate(draft),
      ]);
      const temporaryId = draft.id;

      post.reject(new Error("bad"));
      const results = await both;

      expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
      expect(store.records).toHaveLength(0);
      expect(store.peekRecord(temporaryId)).toBeUndefined();
      expect(draft.id).toBeUndefined();
      expect(draft.isNew).toBe(true);
    });

    it("refuses to re-create a record the store already holds", async () => {
      client.post.mockResolvedValue(mockResponse({ id: "real-1", email: "a@b.com" }));

      const draft = UserModel.create({ email: "a@b.com" });
      await store.optimisticCreate(draft);

      // Rollback evicts by identity, so a second create for a confirmed instance
      // could otherwise delete the record the first one just established.
      await expect(store.optimisticCreate(draft)).rejects.toThrow("already in the store");

      expect(client.post).toHaveBeenCalledTimes(1);
      expect(store.records).toHaveLength(1);
      expect(draft.id).toBe("real-1");
      expect(store.peekRecord("real-1")).toBe(draft);
    });
  });

  describe("create() + save() identity (regression)", () => {
    it("stores exactly one model-typed record, not a duplicate raw-json entry", async () => {
      client.post.mockResolvedValue(mockResponse({ id: "100", email: "new@x.com" }));

      const draft = UserModel.create({ email: "new@x.com" });
      await draft.save();

      const matches = store.records.filter((r) => r.email === "new@x.com");
      expect(matches).toHaveLength(1); // no duplicate raw-json entry
      expect(matches[0]).toBeInstanceOf(UserModel); // a model, not raw json
      // The cached record is the saved draft itself (identity preserved),
      // not a second object built from the response.
      expect(store.peekRecord("100")).toBe(draft);
      expect(draft.id).toBe("100");
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

    it("reports hasMore correctly on a fresh query after a page was cached (regression)", async () => {
      client.get.mockResolvedValue(
        mockResponse({
          data: [{ id: "1", email: "a" }],
          meta: { page: 1, totalPages: 3, totalCount: 12, hasMore: true },
        }),
      );

      // First query loads page 1 (this used to populate the query cache).
      const q1 = store.createPaginatedQuery();
      await q1.loadMore();
      expect(q1.hasMore).toBe(true);

      // A reset creates a brand-new query that fetches page 1 again. The cache
      // must not swallow `meta` and collapse hasMore to false.
      const q2 = store.createPaginatedQuery();
      await q2.loadMore();
      expect(q2.hasMore).toBe(true);
      expect(q2.totalCount).toBe(12);
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
