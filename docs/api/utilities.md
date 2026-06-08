# Utilities

Standalone helpers, all importable from `@ofrusch/kita`. `AsyncStore` uses them internally, but they work on their own too.

[[toc]]

## `RequestTracker`

```ts
class RequestTracker {
  dedupe<T>(key: string, request: () => Promise<T>): Promise<T>;
  hasPending(key: string): boolean;
  clear(): void;
}
```

Deduplicates concurrent in-flight requests. If a request with the same `key` is already running, `dedupe` returns the existing promise instead of starting a second one. The entry is dropped once the promise settles.

```ts
import { RequestTracker } from "@ofrusch/kita";

const tracker = new RequestTracker();
const user = await tracker.dedupe(`user-${id}`, () => api.get(`/users/${id}`));
```

`AsyncStore` keys its `findRecord`/`findRecords` dedup on the operation + id + params.

## `QueryCache`

```ts
class QueryCache<T> {
  constructor(defaultTTL?: number); // default 60000ms
  get(params: Record<string, unknown>, ttl?: number): T[] | null;
  set(params: Record<string, unknown>, data: T[]): void;
  has(params: Record<string, unknown>, ttl?: number): boolean;
  invalidate(predicate?: (params: Record<string, unknown>) => boolean): void;
  get size(): number;
  clear(): void;
}
```

A TTL-based cache for list queries, keyed by a stable serialization of the params (key order doesn't matter). `get` returns `null` and evicts the entry once it's older than the TTL.

```ts
import { QueryCache } from "@ofrusch/kita";

const cache = new QueryCache<Item>(60_000); // 1 minute
cache.set({ q: "hello" }, results);
cache.get({ q: "hello" });        // results, or null if expired
cache.invalidate((p) => p.q === "hello");
```

`AsyncStore.findRecords` uses this internally and auto-invalidates on any create/update/delete. Call [`store.invalidateQueries()`](/api/stores#invalidatequeries) after a custom mutation.

## `PaginatedQuery`

```ts
class PaginatedQuery<T> {
  constructor(fetcher: (page: number) => Promise<PaginatedResult<T>>);
  get hasMore(): boolean;
  get isLoading(): boolean;
  get page(): number;
  get totalCount(): number;
  get totalPages(): number;
  loadMore(): Promise<T[]>;
  reset(): void;
}
```

Page-tracking for "load more" / infinite-scroll UIs. `loadMore` advances one page and returns its records; it's a no-op (returns `[]`) when `hasMore` is false or a fetch is already in flight. The fetcher returns a [`PaginatedResult`](/api/types#paginatedresult).

```ts
import { PaginatedQuery } from "@ofrusch/kita";

const query = new PaginatedQuery(async (page) => {
  const { records, meta } = await store.findRecords({ page });
  return { records, meta };
});

await query.loadMore();
query.hasMore;
```

Usually you'll get one pre-wired from [`AsyncStore.createPaginatedQuery`](/api/stores#createpaginatedquery). Full guide: [Pagination](/cookbook/pagination).

## `withOptimisticUpdate`

```ts
function withOptimisticUpdate<TSnapshot, TResult>(
  optimisticAction: () => TSnapshot,
  serverAction: () => Promise<TResult>,
  rollback: (snapshot: TSnapshot) => void,
): Promise<TResult>;
```

Runs `optimisticAction` (which returns a rollback snapshot), then awaits `serverAction`. If the server action rejects, `rollback(snapshot)` runs and the error re-throws. Returns the server action's result.

```ts
import { withOptimisticUpdate } from "@ofrusch/kita";

await withOptimisticUpdate(
  () => { const snap = { votes: item.votes }; item.votes += 1; return snap; },
  () => api.post(`/items/${item.id}/vote`),
  (snap) => { item.votes = snap.votes; },
);
```

`AsyncStore`'s `optimisticCreate` / `optimisticUpdate` / `optimisticDelete` are built on this. Full guide: [Optimistic updates](/cookbook/optimistic-updates).

## See also

- [Stores](/api/stores) · [Types](/api/types)
- Cookbook: [Pagination](/cookbook/pagination) · [Optimistic updates](/cookbook/optimistic-updates)
