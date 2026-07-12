import { sortedSerialize } from "./serialize";

interface CacheEntry<T, M> {
  data: T;
  meta?: M;
  timestamp: number;
  params: Record<string, unknown>;
}

/**
 * Caches query results with TTL-based expiration and invalidation support.
 *
 * Optionally carries response metadata (`M`) alongside the records — e.g.
 * pagination meta — so a cache hit can return it via {@link QueryCache.getEntry}.
 */
export class QueryCache<T, M = Record<string, unknown>> {
  private cache = new Map<string, CacheEntry<T[], M>>();

  constructor(private defaultTTL = 60000) {} // 1 minute default

  /**
   * Create a stable cache key from query parameters.
   * Sorts keys at every level of nesting to ensure consistent ordering.
   */
  private makeKey(params: Record<string, unknown>): string {
    return sortedSerialize(params);
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

  /**
   * Store data in the cache, optionally with response metadata.
   */
  set(params: Record<string, unknown>, data: T[], meta?: M): void {
    const key = this.makeKey(params);
    this.cache.set(key, { data, meta, timestamp: Date.now(), params });
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
