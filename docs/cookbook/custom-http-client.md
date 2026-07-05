# Custom HTTP client

kita never imports a specific HTTP library. `AsyncStore` and `ApplicationStore` depend only on the duck-typed [`HttpClient`](/api/types#httpclient) interface, so anything matching its shape works.

## The interface

```ts
export interface HttpClient {
  get<T>(url: string, config?: HttpRequestConfig): Promise<{ data: T }>;
  post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<{ data: T }>;
  put<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<{ data: T }>;
  delete<T>(url: string, config?: HttpRequestConfig): Promise<{ data: T }>;
}
```

[`HttpRequestConfig`](/api/types#httprequestconfig) carries `params`, `signal` (AbortSignal), and `headers`. The key convention: **responses are wrapped in `{ data }`**, exactly like axios.

## axios — zero adapter

`AxiosInstance` satisfies `HttpClient` structurally. Pass it straight in:

```ts
import axios from "axios";

const client = axios.create({ baseURL: "/api" });
createAndRegisterStore(AppStore, [UserStore], client);
```

This is also where authentication lives — an interceptor, not a kita concern:

```ts
client.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getToken()}`;
  return config;
});
```

## Typing the client on your store

`AsyncStore` and `ApplicationStore` take an optional second type parameter, `TClient extends HttpClient`, so `this.client` can carry the real type of whatever client you inject — instead of the minimal `HttpClient`, where `res.data` is `unknown`.

At the store level, parameterize `AsyncStore` with your client's type:

```ts
import type { AxiosInstance } from "axios";

class UserStore extends AsyncStore<UserModel, AxiosInstance> {}
// this.client: AxiosInstance — res.data is axios-typed, and
// axios-specific config like `timeout` is available on requests
```

To keep registration typed end-to-end, parameterize `ApplicationStore` the same way:

```ts
class AppStore extends ApplicationStore<AxiosInstance> {}

createAndRegisterStore(AppStore, [UserStore], axios);
// the client argument must be assignable to AxiosInstance
```

The payoff: axios-typed `res.data`, access to client-specific request options (`timeout`, etc.), and no more `declare protected client: AxiosInstance` workaround to get proper types inside the store.

`TClient` is entirely optional and defaults to `HttpClient`, so this is fully backward-compatible — existing `AsyncStore<T>` and bare `class AppStore extends ApplicationStore {}` code keeps working unchanged, accepting any conforming client.

## ky

ky returns the parsed body directly, so wrap it to produce `{ data }`:

```ts
import ky from "ky";
import type { HttpClient } from "@ofrusch/kita";

const api = ky.create({ prefixUrl: "/api" });

export const kyClient: HttpClient = {
  get: async (url, config) =>
    ({ data: await api.get(strip(url), { searchParams: config?.params, signal: config?.signal, headers: config?.headers }).json() }),
  post: async (url, data, config) =>
    ({ data: await api.post(strip(url), { json: data, signal: config?.signal, headers: config?.headers }).json() }),
  put: async (url, data, config) =>
    ({ data: await api.put(strip(url), { json: data, signal: config?.signal, headers: config?.headers }).json() }),
  delete: async (url, config) =>
    ({ data: await api.delete(strip(url), { signal: config?.signal, headers: config?.headers }).json() }),
};

// ky disallows leading slashes when prefixUrl is set
const strip = (url: string) => url.replace(/^\//, "");
```

## Native fetch

A thin wrapper over `fetch` covers the whole interface:

```ts
import type { HttpClient, HttpRequestConfig } from "@ofrusch/kita";

const BASE = "/api";

async function request<T>(method: string, url: string, body?: unknown, config?: HttpRequestConfig): Promise<{ data: T }> {
  const qs = config?.params ? "?" + new URLSearchParams(config.params).toString() : "";
  const res = await fetch(BASE + url + qs, {
    method,
    headers: { "Content-Type": "application/json", ...config?.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: config?.signal,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return { data: (await res.json()) as T };
}

export const fetchClient: HttpClient = {
  get: (url, config) => request("GET", url, undefined, config),
  post: (url, data, config) => request("POST", url, data, config),
  put: (url, data, config) => request("PUT", url, data, config),
  delete: (url, config) => request("DELETE", url, undefined, config),
};
```

## Testing with a mock

For tests, a mock client is just an object with the four methods. The repo's test helper uses `vi.fn()`:

```ts
const client = {
  get: vi.fn().mockResolvedValue({ data: { id: "u-1", email: "a@b.com" } }),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};
```

The playground ships a full in-memory `MockHttpClient` if you want a runnable reference.

## See also

- [`HttpClient`](/api/types#httpclient) · [`HttpRequestConfig`](/api/types#httprequestconfig) · [`HttpResponse`](/api/types#httpresponse)
- [Validation](/cookbook/validation) — parse/validate responses inside or around the client
