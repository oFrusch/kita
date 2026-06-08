interface CacheEntry<T> {
  data: T;
  timestamp: number;
  params: Record<string, unknown>;
}

/**
 * Caches query results with TTL-based expiration and invalidation support.
 */
export class QueryCache<T> {
  private cache = new Map<string, CacheEntry<T[]>>();

  constructor(private defaultTTL = 60000) {} // 1 minute default

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
   * Get cached data if it exists and hasn't expired.
   * Returns null if no valid cache entry exists.
   */
  get(params: Record<string, unknown>, ttl = this.defaultTTL): T[] | null {
    const key = this.makeKey(params);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in the cache.
   */
  set(params: Record<string, unknown>, data: T[]): void {
    const key = this.makeKey(params);
    this.cache.set(key, { data, timestamp: Date.now(), params });
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
