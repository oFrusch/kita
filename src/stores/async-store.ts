import { reactive, Ref, ref, toRaw } from "vue";
import type { HttpClient } from "../http";
import ModelStoreRegistry from "../model-store-registry";
import { AsyncModel } from "../models";
import { withOptimisticUpdate } from "../utils/optimistic";
import { PaginatedQuery, type PaginatedResult } from "../utils/pagination";
import { QueryCache } from "../utils/query-cache";
import { RequestTracker } from "../utils/request-tracker";
import type { FindRecordsOptions } from "./abstract-store";

const underscore = (s: string) => {
  return s
    .split(/\.?(?=[A-Z])/)
    .join("_")
    .toLowerCase();
};

interface ConstructorArgs {
  APIUrl?: string;
}

export class AsyncStore<T extends AsyncModel, TClient extends HttpClient = HttpClient> {
  static readonly id: string;

  protected readonly _records: Ref<T[]>;
  protected readonly _recordsById: Map<string, T>;
  protected readonly client: TClient;
  protected page = 1;
  protected nextPage = 1;
  protected APIUrl: string;
  protected requestTracker = new RequestTracker();
  private queryCache = new QueryCache<T>();
  private nextTemporaryId = 0;
  private readonly pendingCreates = new Map<T, Promise<T>>();

  constructor(client: TClient, args: ConstructorArgs) {
    this._records = ref([]);
    this._recordsById = new Map();
    this.client = client;

    if (args.APIUrl) {
      this.APIUrl = args.APIUrl;
    } else {
      // @ts-expect-error
      this.APIUrl = underscore(this.constructor.id);
    }
  }

  public get records() {
    return this._records.value;
  }

  public set records(value) {
    this._records.value = value;
  }

  public get stores() {
    return ModelStoreRegistry.allStores();
  }

  protected get modelType(): typeof AsyncModel {
    // @ts-expect-error
    return ModelStoreRegistry.getModel(this.constructor.id);
  }

  protected reset() {
    this._records.value = [];
    this._recordsById.clear();
    this.requestTracker.clear();
    this.queryCache.clear();
    this.pendingCreates.clear();
    this.nextPage = 0;
    this.page = 0;
  }

  public peekRecord(id: string): T | undefined {
    return this._recordsById.get(id);
  }

  /**
   * Find a single record by ID. Returns the cached record if present,
   * otherwise fetches from the API and caches it.
   *
   * Concurrent requests for the same record are deduplicated.
   *
   * @param id - Record ID to fetch
   * @param params - Query parameters for the request
   * @param revalidate - Force a refetch even if a cached record exists
   */
  public async findRecord(
    id: string,
    params: Record<string, unknown> = {},
    revalidate = false,
  ): Promise<T | undefined> {
    const existing = this._recordsById.get(id);
    if (existing && !revalidate) return existing;
    return this._fetchAndCacheRecord(id, params);
  }

  /**
   * Fetch a record from the API and merge it into the local cache.
   * Exposed as `protected` so SWR/custom subclasses can hook into the fetch path.
   */
  protected async _fetchAndCacheRecord(id: string, params: Record<string, unknown>): Promise<T> {
    const cacheKey = `findRecord:${id}:${JSON.stringify(params)}`;

    return this.requestTracker.dedupe(cacheKey, async () => {
      const res = await this.client.get<any>(`/${this.APIUrl}/${id}/`, { params });
      const record = this.modelType.create(res.data) as T;

      // Update existing record or push new one
      const existing = this._recordsById.get(id);
      if (existing) {
        Object.assign(existing, record);
        return existing;
      }

      return record;
    });
  }

  /**
   * Find multiple records with query caching support.
   * Deduplicates concurrent requests with the same params.
   *
   * @param params - Query parameters for the request
   * @param options - Cache options or boolean for legacy replaceStore
   */
  public async findRecords(
    params: Record<string, unknown> = {},
    options: FindRecordsOptions | boolean = {},
  ): Promise<{ records: T[]; meta?: Record<string, unknown> }> {
    // Support legacy boolean replaceStore parameter
    const opts: FindRecordsOptions =
      typeof options === "boolean" ? { replaceStore: options } : options;
    const { cache = true, cacheTTL, replaceStore = false } = opts;

    // Check cache first (unless replacing store)
    if (cache && !replaceStore) {
      const cached = this.queryCache.getEntry(params, cacheTTL);
      if (cached) {
        return { records: cached.data, meta: cached.meta };
      }
    }

    const cacheKey = `findRecords:${JSON.stringify(params)}:${replaceStore}`;

    return this.requestTracker.dedupe(cacheKey, async () => {
      const res = await this.client.get<any>(`/${this.APIUrl}/`, { params });
      let recordsJSON, meta;
      if (res.data.meta) {
        recordsJSON = res.data.data;
        meta = res.data.meta;
      } else {
        recordsJSON = res.data;
        meta = undefined;
      }
      if (replaceStore) this.reset();
      const newRecords = recordsJSON.map((json: object) => this.modelType.create(json)) as T[];

      // Cache the results (with meta, so a cache hit can return it too)
      if (cache) {
        this.queryCache.set(params, newRecords, meta);
      }

      return { records: newRecords, meta };
    });
  }

  /**
   * Invalidate all cached query results.
   * Optionally provide a predicate to selectively invalidate.
   */
  public invalidateQueries(predicate?: (params: Record<string, unknown>) => boolean): void {
    this.queryCache.invalidate(predicate);
  }

  /**
   * Persist a record. POSTs if the record is new (no id), PUTs otherwise.
   * Returns the server-confirmed record.
   *
   * Higher-level than the protected `_createRecord` / `_updateRecord` —
   * normal consumer code should call this (or `model.save()`).
   */
  public async save(record: T): Promise<T> {
    return record.isNew ? this._createRecord(record) : this._updateRecord(record);
  }

  /**
   * Delete a record. Removes locally if the record is new (no id),
   * otherwise issues a DELETE then removes locally.
   *
   * Higher-level than the protected `_deleteRecord` — normal consumer
   * code should call this (or `model.delete()`).
   */
  public async delete(record: T): Promise<void> {
    if (record.isNew) {
      this._removeRecord(record);
      return;
    }
    await this._deleteRecord(record);
  }

  protected async _updateRecord(record: T): Promise<T> {
    const res = await this.client.put<any>(`/${this.APIUrl}/${record.id}/`, record.serialize());
    const updatedRecord = Object.assign(record, res.data);
    this.queryCache.invalidate();
    return updatedRecord;
  }

  /**
   * POST a record and merge the server response onto it. Store membership is
   * left to the caller, so both the `save()` path and the optimistic path can
   * share the request.
   *
   * @param record - The model instance to persist and merge the response into
   * @param payload - Request body; defaults to the record's current state
   */
  protected async _postRecord(record: T, payload: string = record.serialize()): Promise<T> {
    const res = await this.client.post<any>(`/${this.APIUrl}/`, payload);
    // Merge onto the record being saved rather than building a model out of
    // `res.data`: the caller already holds this instance, and the response is
    // only there to carry the server-assigned id. Merge through the *reactive*
    // view, because `records` stores raw targets — assigning straight onto the
    // instance bypasses the proxy's set trap, so a record already in the list
    // would never re-render. `reactive()` hands back the proxy Vue has cached
    // for this target, and writes through to it.
    Object.assign(reactive(record), res.data);

    return record;
  }

  protected async _createRecord(record: T): Promise<T> {
    await this._postRecord(record);

    const newRecord = this._pushRecord(record);
    this.queryCache.invalidate();

    return newRecord;
  }

  protected async _deleteRecord(record: T) {
    await this.client.delete(`/${this.APIUrl}/${record?.id}/`);
    this._removeRecord(record);
    this.queryCache.invalidate();
  }

  public _removeRecord(record: T) {
    this._recordsById.delete(record.id);
    this.records = this.records.filter((r) => r.id !== record.id);
  }

  public _pushRecord(record: T) {
    const existing = this._recordsById.get(record.id);

    if (existing) {
      Object.assign(existing, record);
      return existing;
    }

    this._recordsById.set(record.id, record);
    this.records.push(record);
    return record;
  }

  /**
   * Create a record optimistically - adds to store immediately, syncs with server.
   * Rolls back on error.
   *
   * The record instance itself is inserted under a temporary id and stays in
   * `records` for the whole round-trip, so it keeps its prototype and never
   * flickers out of the list. On success only the `_recordsById` key is swapped
   * from the temporary id to the server id.
   *
   * The pending record carries the temporary id, so it is *not* `isNew` while
   * the POST is in flight — do not call `save()` / `delete()` on it until this
   * promise settles. Re-entrant calls for the same instance (a double-submitted
   * form) share the in-flight request rather than issuing a second POST.
   *
   * @param record - A record not yet in the store; pass an existing one to `save()`
   * @throws If the store already holds this instance under its current id
   */
  public async optimisticCreate(record: T): Promise<T> {
    const target = toRaw(record);
    const inFlight = this.pendingCreates.get(target);

    if (inFlight) return inFlight;

    // Re-creating an instance the store already holds is never right: it would
    // POST a duplicate row, push the instance into `records` twice, and let a
    // rollback evict the copy the first create confirmed. Re-persisting an
    // existing record is what `save()` is for.
    const stored = this._recordsById.get(record.id);

    if (stored && toRaw(stored) === target) {
      throw new Error(
        `Record "${record.id}" is already in the store — use save() to update it, not optimisticCreate().`,
      );
    }

    const originalId = record.id;
    const temporaryId = `temp_${++this.nextTemporaryId}`;
    // Serialized before the temporary id is assigned, so the POST body carries
    // the pristine record. `serialize(["id"])` would strip `id` at every nesting
    // depth, dropping nested ids too.
    const payload = record.serialize();

    const request = withOptimisticUpdate(
      () => {
        Object.assign(reactive(record), { id: temporaryId });
        this._pushRecord(record);
      },
      async () => {
        await this._postRecord(record, payload);

        this._recordsById.delete(temporaryId);

        // The server id may already be held by a *different* instance — a
        // concurrent `findRecords` that returned the new row, or an upsert
        // endpoint echoing an existing one. Mirror `_pushRecord` and merge into
        // the incumbent, rather than leaving two array entries under one id.
        const existing = this._recordsById.get(record.id);

        if (existing && toRaw(existing) !== target) {
          Object.assign(reactive(existing), record);
          this.records = this.records.filter((r) => toRaw(r) !== target);
          this.queryCache.invalidate();

          return existing;
        }

        this._recordsById.set(record.id, record);
        this.queryCache.invalidate();

        return record;
      },
      () => {
        // The instance may already have been re-keyed to a real server id by a
        // confirmed create, in which case unwinding would evict a live record.
        // Only roll back what is still parked under the temporary id.
        if (record.id !== temporaryId) return;

        this._recordsById.delete(temporaryId);
        // Not `_removeRecord`: it matches on `record.id`, which is a moving
        // target here. Evict by identity — `toRaw` because `records` is a deep
        // `ref`, so its instrumented `filter` hands the callback reactive
        // proxies, never the raw instance.
        this.records = this.records.filter((r) => toRaw(r) !== target);

        Object.assign(reactive(record), { id: originalId });
      },
    );

    this.pendingCreates.set(target, request);

    try {
      return await request;
    } finally {
      this.pendingCreates.delete(target);
    }
  }

  /**
   * Update a record optimistically - applies changes immediately, syncs with server.
   * Rolls back to previous state on error.
   */
  public async optimisticUpdate(record: T): Promise<T> {
    const existing = this._recordsById.get(record.id);
    if (!existing) {
      // No existing record, just do a normal update
      return this._updateRecord(record);
    }

    const snapshot = { ...existing };

    return withOptimisticUpdate(
      () => {
        Object.assign(existing, record);
        return snapshot;
      },
      () => this._updateRecord(record),
      (snapshot) => {
        Object.assign(existing, snapshot);
      },
    );
  }

  /**
   * Delete a record optimistically - removes from store immediately, syncs with server.
   * Restores record on error.
   */
  public async optimisticDelete(record: T): Promise<void> {
    const snapshot = { ...record };
    const index = this.records.indexOf(record);

    return withOptimisticUpdate(
      () => {
        this._removeRecord(record);
        return { snapshot, index };
      },
      async () => {
        await this._deleteRecord(record);
      },
      ({ snapshot, index }) => {
        // Restore the record at its original position
        this._recordsById.set(snapshot.id, snapshot as T);
        if (index >= 0 && index < this.records.length) {
          this.records.splice(index, 0, snapshot as T);
        } else {
          this.records.push(snapshot as T);
        }
      },
    );
  }

  /**
   * Create a paginated query helper for fetching records in pages.
   * Handles page tracking, loading state, and hasMore detection.
   *
   * @param params - Base query parameters (page will be added automatically)
   * @returns PaginatedQuery instance with loadMore(), reset(), and state getters
   */
  public createPaginatedQuery(params: Record<string, unknown> = {}): PaginatedQuery<T> {
    return new PaginatedQuery(async (page) => {
      // `cache: false` — the query cache stores records only, so a cache hit
      // returns `meta: undefined` and the pagination math below collapses to
      // `hasMore: false`. Each page is fetched once during a scroll anyway, and
      // a reset is meant to refetch, so caching here is both wrong and useless.
      const { records, meta } = await this.findRecords({ ...params, page }, { cache: false });
      return {
        records,
        meta: {
          page,
          totalPages: (meta?.totalPages as number) ?? 1,
          totalCount: (meta?.totalCount as number) ?? records.length,
          hasMore: (meta?.hasMore as boolean) ?? false,
        },
      } as PaginatedResult<T>;
    });
  }
}
