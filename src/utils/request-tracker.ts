type PendingRequest<T> = Promise<T>;

/**
 * Deduplicates in-flight requests by tracking pending promises.
 * When multiple callers request the same resource simultaneously,
 * only one network request is made and the result is shared.
 */
export class RequestTracker {
  private pending = new Map<string, PendingRequest<unknown>>();

  /**
   * Execute a request with deduplication. If a request with the same key
   * is already in flight, returns the existing promise instead of starting a new one.
   */
  async dedupe<T>(key: string, request: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;

    const promise = request().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Check if a request with the given key is currently in flight.
   */
  hasPending(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Clear all pending requests (useful for cleanup/reset).
   */
  clear(): void {
    this.pending.clear();
  }
}
