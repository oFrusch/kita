interface CacheEntry<T, M> {
  data: T;
  meta?: M;
  timestamp: number;
  ttl: number;
  params: Record<string, unknown>;
}

const DEFAULT_TTL = 60_000;
const DEFAULT_MAX_SIZE = 100;

function assertPositiveInteger(option: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`QueryCache: ${option} must be a positive integer, received ${value}`);
  }
}

/**
 * Configuration for a {@link QueryCache}.
 */
export interface QueryCacheOptions {
  /**
   * Milliseconds an entry stays valid for. Must be a positive integer.
   * Defaults to `60_000`.
   */
  ttl?: number;

  /**
   * Maximum number of entries to retain. Once exceeded, the oldest entries are
   * evicted. Must be a positive integer. Defaults to `100`.
   */
  maxSize?: number;
}

/**
 * Caches query results with TTL-based expiration and invalidation support.
 *
 * Optionally carries response metadata (`M`) alongside the records — e.g.
 * pagination meta — so a cache hit can return it via {@link QueryCache.getEntry}.
 *
 * The cache is bounded: every {@link QueryCache.set} first sweeps expired
 * entries, then evicts from the oldest end until `size <= maxSize`. This keeps
 * high-cardinality params (a search box caching per keystroke, per-user filters,
 * pagination cursors) from growing the cache forever.
 *
 * Eviction is insertion-order (FIFO), not LRU: reading an entry does not refresh
 * its recency, only re-writing it does.
 */
export class QueryCache<T, M = Record<string, unknown>> {
  private cache = new Map<string, CacheEntry<T[], M>>();
  private defaultTTL: number;
  private maxSize: number;

  /**
   * Create a cache with a custom TTL in milliseconds, or the default TTL (60s)
   * and max size (100 entries) when omitted.
   *
   * @throws {RangeError} If `ttl` is not a positive integer.
   */
  constructor(ttl?: number);

  /**
   * Create a cache with a custom TTL and/or max size.
   *
   * @throws {RangeError} If `ttl` or `maxSize` is not a positive integer.
   */
  constructor(options?: QueryCacheOptions);

  constructor(options: number | QueryCacheOptions = {}) {
    const { ttl = DEFAULT_TTL, maxSize = DEFAULT_MAX_SIZE }: QueryCacheOptions =
      typeof options === "number" ? { ttl: options } : options;

    assertPositiveInteger("ttl", ttl);
    assertPositiveInteger("maxSize", maxSize);

    this.defaultTTL = ttl;
    this.maxSize = maxSize;
  }

  /**
   * Create a stable cache key from query parameters.
   * Sorts keys to ensure consistent ordering.
   */
  private makeKey(params: Record<string, unknown>): string {
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedParams[key] = params[key];
    }
    return JSON.stringify(sortedParams);
  }

  /**
   * Get cached records if a valid (unexpired) entry exists, else null.
   */
  get(params: Record<string, unknown>, ttl = this.defaultTTL): T[] | null {
    return this.getEntry(params, ttl)?.data ?? null;
  }

  /**
   * Get the full cached entry — records plus any stored metadata — if a valid
   * (unexpired) entry exists, else null. Use this when the cached query carried
   * response metadata (e.g. pagination meta) you need on a cache hit.
   */
  getEntry(params: Record<string, unknown>, ttl = this.defaultTTL): { data: T[]; meta?: M } | null {
    const key = this.makeKey(params);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    return { data: entry.data, meta: entry.meta };
  }

  private deleteExpiredEntries(now = Date.now()): void {
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  private enforceMaximumSize(): void {
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;

      if (oldestKey === undefined) return;

      this.cache.delete(oldestKey);
    }
  }

  /**
   * Store data in the cache, optionally with response metadata.
   *
   * Sweeps expired entries and evicts the oldest ones if the write pushes the
   * cache past `maxSize`. Re-writing an existing key makes it the newest entry.
   *
   * Pass `ttl` to give this entry a lifetime other than the cache's default. The
   * sweep honours each entry's own ttl, so a longer-lived entry survives writes
   * to unrelated keys.
   */
  set(params: Record<string, unknown>, data: T[], meta?: M, ttl = this.defaultTTL): void {
    const key = this.makeKey(params);
    const now = Date.now();

    this.deleteExpiredEntries(now);

    // Deleting before re-inserting moves the key to the back of the Map's
    // insertion order, so a rewrite counts as new and eviction — which takes
    // from the front — reaches it last.
    this.cache.delete(key);
    this.cache.set(key, { data, meta, timestamp: now, ttl, params });

    this.enforceMaximumSize();
  }

  /**
   * Check if a cache entry exists and is still valid.
   */
  has(params: Record<string, unknown>, ttl = this.defaultTTL): boolean {
    return this.get(params, ttl) !== null;
  }

  /**
   * Invalidate cache entries.
   * If no predicate is provided, clears all entries.
   * If a predicate is provided, only clears entries where predicate returns true.
   */
  invalidate(predicate?: (params: Record<string, unknown>) => boolean): void {
    if (!predicate) {
      this.cache.clear();
      return;
    }

    for (const [key, entry] of this.cache) {
      if (predicate(entry.params)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }
}
