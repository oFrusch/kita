import { Ref, ref } from "vue";
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
        this.queryCache.set(params, newRecords, meta, cacheTTL);
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

  protected async _createRecord(record: T): Promise<T> {
    const res = await this.client.post<any>(`/${this.APIUrl}/`, record.serialize());
    // Merge the server response (which carries the assigned id) onto the record
    // being saved, then register that model instance under its new id. Pushing
    // `res.data` directly would store raw JSON as a *second*, non-model record.
    Object.assign(record, res.data);
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
   */
  public async optimisticCreate(record: T): Promise<T> {
    const tempId = `temp_${Date.now()}`;
    const tempRecord = { ...record, id: tempId } as T;

    return withOptimisticUpdate(
      () => {
        this._pushRecord(tempRecord);
        return tempRecord;
      },
      async () => {
        const created = await this._createRecord(record);
        this._removeRecord(tempRecord);
        return created;
      },
      (snapshot) => {
        this._removeRecord(snapshot);
      },
    );
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
