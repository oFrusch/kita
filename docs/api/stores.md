# Stores

A store owns a collection of records of one model type and the operations over them. Import from `@ofrusch/kita`. Every store has a `static readonly id` that ties it to the model of the same id.

[[toc]]

## `AbstractStore`

```ts
abstract class AbstractStore<T extends AbstractModel> {
  static readonly id: string;
  get records(): T[];
  set records(value: T[]);
  protected abstract reset(): void;
  abstract findRecord(id: string): T | undefined;
  abstract _pushRecord(record: T): void;
  abstract _deleteRecord(record: T): void;
  abstract _updateRecord(record: T): T;
}
```

The shared base of [`Store`](#store). It declares the reactive `records` array and the record-management contract subclasses implement. You won't instantiate it directly; it's exported for `instanceof` checks and custom store bases.

> Note: [`AsyncStore`](#asyncstore) implements the same conceptual surface but does **not** extend `AbstractStore` — it's a standalone class with its own HTTP-oriented members.

## `Store`

```ts
class Store<T extends Model> extends AbstractStore<T> {
  constructor(...args: any[]);
  findRecord(id: string): T | undefined;
  peekRecord(id: string): T | undefined;
  _pushRecord(record: T): T;
  _removeRecord(record: T): void;
  _updateRecord(record: T): T;
  _deleteRecord(record: T): void;
}
```

A synchronous, in-memory store — no HTTP. Use it for client-only state (filters, UI selections, derived collections). Pair with [`Model`](/api/models#model).

- **`findRecord(id)` / `peekRecord(id)`** — look up a record by id from the local map (`O(1)`); returns `undefined` if absent.
- **`_pushRecord(record)`** — insert, or merge into an existing record with the same id via `Object.assign` (preserving identity). Returns the stored record.
- **`_removeRecord` / `_deleteRecord(record)`** — remove by id.

```ts
class FilterStore extends Store<FilterModel> {
  static readonly id = "filters";

  @reactive() accessor query: string = "";
}
```

## `AsyncStore`

```ts
class AsyncStore<T extends AsyncModel, TClient extends HttpClient = HttpClient> {
  static readonly id: string;
  protected readonly client: TClient;
  constructor(client: TClient, args: { APIUrl?: string });

  get records(): T[];
  set records(value: T[]);
  get stores(): ApplicationStore;

  peekRecord(id: string): T | undefined;
  findRecord(id: string, params?: Record<string, unknown>, revalidate?: boolean): Promise<T | undefined>;
  findRecords(params?: Record<string, unknown>, options?: FindRecordsOptions | boolean): Promise<{ records: T[]; meta?: Record<string, unknown> }>;
  invalidateQueries(predicate?: (params: Record<string, unknown>) => boolean): void;

  save(record: T): Promise<T>;
  delete(record: T): Promise<void>;

  optimisticCreate(record: T): Promise<T>;
  optimisticUpdate(record: T): Promise<T>;
  optimisticDelete(record: T): Promise<void>;

  createPaginatedQuery(params?: Record<string, unknown>): PaginatedQuery<T>;

  _pushRecord(record: T): T;
  _removeRecord(record: T): void;

  // protected — override points for subclasses
  protected _fetchAndCacheRecord(id: string, params: Record<string, unknown>): Promise<T>;
  protected _postRecord(record: T, payload?: string): Promise<T>;
  protected _createRecord(record: T): Promise<T>;
  protected _updateRecord(record: T): Promise<T>;
  protected _deleteRecord(record: T): Promise<void>;
  protected get modelType(): typeof AsyncModel;
  protected reset(): void;
}
```

The HTTP-backed store. Pair with [`AsyncModel`](/api/models#asyncmodel).

### Construction & API path

Instantiated for you by [`ApplicationStore.registerStore`](/api/application-store#registerstore). The API path defaults to a snake_cased `id` (`UserStore` with `id = "users"` → `/users/`); override with `APIUrl`:

```ts
class LegacyStore extends AsyncStore<ThingModel> {
  static readonly id = "things";
  constructor(client: HttpClient) {
    super(client, { APIUrl: "v1/legacy_things" });
  }
}
```

### `findRecord`

Returns the cached record if present, otherwise fetches `GET /:path/:id/` and caches it. Concurrent calls for the same id are deduplicated. Pass `revalidate = true` to force a refetch even on a cache hit.

```ts
const user = await users.findRecord("u-1");
const fresh = await users.findRecord("u-1", {}, true); // force refetch
```

For stale-while-revalidate behavior, use [`AsyncStoreSWR`](#asyncstoreswr).

### `findRecords`

Fetches `GET /:path/`. Detects a paginated response by a `meta` key (returns `{ records, meta }`); otherwise `meta` is `undefined`. Results are cached in a TTL [`QueryCache`](/api/utilities#querycache) and deduplicated.

```ts
const { records } = await users.findRecords({ active: true });
const { records, meta } = await users.findRecords({ page: 2 });
```

Options ([`FindRecordsOptions`](/api/types#findrecordsoptions)):

| Option | Default | Effect |
| --- | --- | --- |
| `cache` | `true` | Read/write the query cache |
| `cacheTTL` | `60000` | Cache lifetime in ms |
| `replaceStore` | `false` | Reset the store before inserting results |

A boolean shorthand maps to `{ replaceStore }`. The query cache auto-invalidates on any create/update/delete.

### `save` / `delete`

The public mutation API. `save` routes on `record.isNew` — POST for new records, PUT otherwise — and returns the server-confirmed record. `delete` removes a new record locally, or issues a DELETE then removes it.

```ts
await users.save(user);
await users.delete(user);
```

The HTTP verbs underneath (`_createRecord`, `_updateRecord`, `_deleteRecord`) are `protected`. `model.save()` / `model.delete()` call these store methods for you.

### `optimisticCreate` / `optimisticUpdate` / `optimisticDelete`

Mutate the local store immediately and reconcile with the server, rolling back on failure. `optimisticCreate` inserts the record instance itself under a temporary id — model methods keep working on the pending record — and swaps the lookup key to the server id once the POST lands. See [Optimistic updates](/cookbook/optimistic-updates).

### `createPaginatedQuery`

Returns a [`PaginatedQuery`](/api/utilities#paginatedquery) wired to `findRecords`, injecting `page` automatically. See [Pagination](/cookbook/pagination).

### `invalidateQueries`

Clears cached `findRecords` results — all, or those whose params match a predicate. Call after a custom mutation that changes which records exist.

```ts
users.invalidateQueries();
users.invalidateQueries((p) => p.team === "eng");
```

### Override points

`_fetchAndCacheRecord`, `_postRecord`, the CRUD verbs, `modelType`, and `reset` are `protected` so subclasses can hook the fetch/mutation path. [`AsyncStoreSWR`](#asyncstoreswr) overrides `findRecord` and `_fetchAndCacheRecord`; the same pattern builds retry/throttle stores. `_postRecord` is the bare POST-and-merge shared by `_createRecord` and `optimisticCreate`, so overriding it covers both create paths.

::: tip Breaking change (unreleased)
`optimisticCreate` no longer calls `_createRecord` — it calls `_postRecord` directly and manages store membership itself. If you hooked the create path by overriding `_createRecord`, that override still runs for `save()` but is **skipped on the optimistic path**. Move the hook to `_postRecord` to cover both.
:::

### Typing the client

`AsyncStore` takes an optional second type parameter, `TClient extends HttpClient = HttpClient`, giving `this.client` the real type of whatever client you inject instead of the minimal `HttpClient`:

```ts
import type { AxiosInstance } from "axios";

class UserStore extends AsyncStore<UserModel, AxiosInstance> {}
// this.client: AxiosInstance — res.data is axios-typed, and
// axios-specific request options like `timeout` are available
```

It's optional and defaults to `HttpClient`, so existing `AsyncStore<T>` usage is unaffected. See [Custom HTTP client → Typing the client on your store](/cookbook/custom-http-client#typing-the-client-on-your-store) for the full walkthrough, including parameterizing `ApplicationStore` to keep registration typed end-to-end.

## `AsyncStoreSWR`

```ts
class AsyncStoreSWR<T extends AsyncModel, TClient extends HttpClient = HttpClient> extends AsyncStore<T, TClient> {
  isRecordStale(id: string, staleTime: number): boolean;
  invalidateRecord(id: string): void;
  findRecord(id: string, params?: Record<string, unknown>, options?: FindRecordOptions | boolean): Promise<T | undefined>;
}
```

`AsyncStore` plus per-record freshness tracking. `findRecord` returns cached data immediately and revalidates in the background when stale. The third arg is a [`FindRecordOptions`](/api/types#findrecordoptions) (`staleTime`, `revalidate`); a boolean maps to `{ revalidate }`.

```ts
class UserStore extends AsyncStoreSWR<UserModel> {
  static readonly id = "users";
}

await users.findRecord("u-1", {}, { staleTime: 30_000 });
users.invalidateRecord("u-1"); // next findRecord refetches
```

Full walkthrough: [Stale-while-revalidate](/cookbook/swr).

## See also

- [Models](/api/models) · [ApplicationStore](/api/application-store)
- [Utilities](/api/utilities) · [Types](/api/types)
