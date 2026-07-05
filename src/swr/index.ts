import type { HttpClient } from "../http";
import type { AsyncModel } from "../models";
import { AsyncStore } from "../stores";

/**
 * Options for stale-while-revalidate `findRecord`.
 */
export interface FindRecordOptions {
  /** Milliseconds before data is considered stale (default: 0 = always stale) */
  staleTime?: number;
  /** Force background revalidation even if data is fresh */
  revalidate?: boolean;
}

/**
 * Opt-in stale-while-revalidate variant of {@link AsyncStore}.
 *
 * Extends `AsyncStore` with per-record freshness tracking. `findRecord`
 * returns cached data immediately when present, then revalidates in the
 * background when the record is older than `staleTime` or when
 * `revalidate: true` is passed.
 *
 * If you don't need SWR semantics, extend {@link AsyncStore} directly —
 * it has simpler typing and a smaller surface.
 *
 * @example
 * ```ts
 * class UserStore extends AsyncStoreSWR<UserModel> {
 *   static readonly id = "users";
 * }
 *
 * // Returns cached user instantly if < 30s old; refetches in background otherwise.
 * await users.findRecord("u-1", {}, { staleTime: 30_000 });
 * ```
 */
export class AsyncStoreSWR<
  T extends AsyncModel,
  TClient extends HttpClient = HttpClient,
> extends AsyncStore<T, TClient> {
  protected recordTimestamps = new Map<string, number>();

  protected reset() {
    super.reset();
    this.recordTimestamps.clear();
  }

  /**
   * Returns true if the record doesn't exist locally or is older than `staleTime`.
   */
  public isRecordStale(id: string, staleTime: number): boolean {
    const timestamp = this.recordTimestamps.get(id);
    if (!timestamp) return true;
    return Date.now() - timestamp > staleTime;
  }

  /**
   * Drop the record's freshness timestamp so the next `findRecord` refetches.
   * Does not remove the record from the local cache.
   */
  public invalidateRecord(id: string): void {
    this.recordTimestamps.delete(id);
  }

  /**
   * Find a single record by ID with stale-while-revalidate semantics.
   *
   * - If a fresh cached record exists, returns it immediately.
   * - If a stale cached record exists, returns it immediately and revalidates in the background.
   * - If no cached record exists, awaits the fetch.
   *
   * @param id - Record ID to fetch
   * @param params - Query parameters for the request
   * @param options - SWR options, or `true` for the legacy "force revalidate" boolean form
   */
  public async findRecord(
    id: string,
    params: Record<string, unknown> = {},
    options: FindRecordOptions | boolean = {},
  ): Promise<T | undefined> {
    const opts: FindRecordOptions =
      typeof options === "boolean" ? { revalidate: options } : options;
    const { staleTime = 0, revalidate = false } = opts;

    const existing = this._recordsById.get(id);
    const timestamp = this.recordTimestamps.get(id) ?? 0;
    const isStale = Date.now() - timestamp > staleTime;

    if (existing && !isStale && !revalidate) {
      return existing;
    }

    if (existing && (isStale || revalidate)) {
      // Fire-and-forget background revalidation. The request tracker dedupes
      // concurrent calls inside _fetchAndCacheRecord.
      void this._fetchAndCacheRecord(id, params);
      return existing;
    }

    return this._fetchAndCacheRecord(id, params);
  }

  /**
   * Override the base fetch to stamp the record with a fresh timestamp.
   */
  protected async _fetchAndCacheRecord(id: string, params: Record<string, unknown>): Promise<T> {
    const record = await super._fetchAndCacheRecord(id, params);
    this.recordTimestamps.set(id, Date.now());
    return record;
  }
}
