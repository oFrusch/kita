# Types

Exported interfaces and type aliases, all importable from `@ofrusch/kita`.

[[toc]]

## HTTP

### `HttpClient`

```ts
interface HttpClient {
  get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  post<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  put<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
}
```

The duck-typed client `AsyncStore` and `ApplicationStore` depend on. Intentionally axios-shaped, so an `AxiosInstance` satisfies it with no adapter. Any client returning `{ data }` works. See [Custom HTTP client](/cookbook/custom-http-client).

### `HttpResponse`

```ts
interface HttpResponse<T = unknown> {
  data: T;
}
```

The response envelope — kita reads `res.data`.

### `HttpRequestConfig`

```ts
interface HttpRequestConfig {
  params?: any;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
```

Per-request options. `params` is loosely typed (`any`) to mirror axios and accept named param types without index signatures. `signal` supports cancellation; `headers` sets per-request headers.

## Find options

### `FindRecordOptions`

```ts
interface FindRecordOptions {
  staleTime?: number;  // ms before data is stale (default 0 = always stale)
  revalidate?: boolean; // force background revalidation
}
```

The options bag for [`AsyncStoreSWR.findRecord`](/api/stores#asyncstoreswr). See [Stale-while-revalidate](/cookbook/swr).

### `FindRecordsOptions`

```ts
interface FindRecordsOptions {
  cache?: boolean;       // use the query cache (default true)
  cacheTTL?: number;     // cache lifetime in ms (default 60000)
  replaceStore?: boolean; // reset the store before inserting (default false)
}
```

The options bag for [`AsyncStore.findRecords`](/api/stores#findrecords). A boolean shorthand maps to `{ replaceStore }`.

## Pagination

### `PaginationMeta`

```ts
interface PaginationMeta {
  page: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
}
```

The metadata shape a paginated API response carries under `meta`. See [Pagination → server contract](/cookbook/pagination#server-contract).

### `PaginatedResult`

```ts
interface PaginatedResult<T> {
  records: T[];
  meta: PaginationMeta;
}
```

What a [`PaginatedQuery`](/api/utilities#paginatedquery) fetcher returns.

## See also

- [Stores](/api/stores) · [Utilities](/api/utilities)
- [Custom HTTP client](/cookbook/custom-http-client)
