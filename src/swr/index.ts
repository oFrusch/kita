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

  private pendingRevalidations = new Set<string>();

  protected reset() {
    super.reset();
    this.recordTimestamps.clear();
    this.pendingRevalidations.clear();
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
      this.revalidateInBackground(id, params);

      return existing;
    }

    return this._fetchAndCacheRecord(id, params);
  }

  /**
   * Called when a *background* revalidation fails. The default implementation is a
   * deliberate no-op: under stale-while-revalidate a failed refresh is non-fatal —
   * the caller already has the stale record and the record stays stale, so the next
   * `findRecord` retries.
   *
   * Override it to surface the failure to your error reporter. A rejection from the
   * awaited path (no cached record) still propagates to the caller and does not
   * reach this hook.
   *
   * Fires once per background revalidation, not once per caller: concurrent
   * `findRecord` calls for the same record share a single refresh. An error thrown by
   * an override is swallowed — a failing reporter must not become the unhandled
   * rejection this hook exists to prevent.
   *
   * @param _error - Rejection value from the background fetch
   * @param _id - ID of the record being revalidated
   *
   * @example
   * ```ts
   * class UserStore extends AsyncStoreSWR<UserModel> {
   *   static readonly id = "users";
   *
   *   protected onRevalidationError(error: unknown, id: string) {
   *     Sentry.captureException(error, { tags: { store: "users", recordId: id } });
   *   }
   * }
   * ```
   */
  protected onRevalidationError(_error: unknown, _id: string): void {}

  private revalidateInBackground(id: string, params: Record<string, unknown>): void {
    const key = `${id}:${JSON.stringify(params)}`;

    // The request tracker already collapses the concurrent HTTP calls, but each caller
    // holds its own promise — without this, one failed refresh would report once per caller.
    if (this.pendingRevalidations.has(key)) return;

    this.pendingRevalidations.add(key);

    void this._fetchAndCacheRecord(id, params)
      .catch((error) => {
        try {
          this.onRevalidationError(error, id);
        } catch {
          // A throwing reporter must not become the unhandled rejection this hook prevents.
        }
      })
      .finally(() => {
        this.pendingRevalidations.delete(key);
      });
  }

  /**
   * Override the base fetch to stamp the record with a fresh timestamp.
   *
   * The stamp lands only after `super` resolves, so a failed fetch leaves the
   * previous timestamp untouched and the record stays stale.
   */
  protected async _fetchAndCacheRecord(id: string, params: Record<string, unknown>): Promise<T> {
    const record = await super._fetchAndCacheRecord(id, params);
    this.recordTimestamps.set(id, Date.now());
    return record;
  }
}
