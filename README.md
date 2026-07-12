# kita

A **frontend ORM and reactive state management framework for Vue 3** — strongly-typed models, HTTP-backed stores, and a model-store registry inspired by [Ember Data](https://github.com/emberjs/data).

**[Documentation](https://kitavue.vercel.app)** · **[Live playground](https://kita-playground.vercel.app)** · **[npm](https://www.npmjs.com/package/@ofrusch/kita)**

If you've used a backend ORM (Active Record, Sequelize, Prisma, AdonisJS Lucid, Django ORM…), kita gives you the same mental model on the client: **model classes that mirror API resources, with stores that handle fetching, caching, mutating, and relating records**. The shape your backend ORM serializes is the same shape your frontend model consumes — no hand-rolled fetcher/setter glue between them.

- **Frontend ORM** — `Model` and `AsyncModel` classes with `.save()` / `.delete()` / relations
- **Pairs cleanly with your backend ORM** — API endpoints exposing typed resources land directly as typed records, no wrapper code per route
- **Stage 3 decorators** — modern `@reactive() accessor` syntax, no `experimentalDecorators` flag
- **HTTP-agnostic** — duck-typed `HttpClient` interface; works with axios, ky, redaxios, or any custom client
- **Built-in helpers** — request deduplication, query caching, pagination, optimistic updates
- **Opt-in SWR** — stale-while-revalidate semantics available as a separate base class
- **Vue DevTools** — inspect every store and record in your app

## SPA only — no SSR support

kita targets **client-side single-page applications**. Server-side rendering (SSR) and multi-app support are explicitly out of scope for `0.x` and will be addressed in `1.0`.

If you need SSR today, stick with [Pinia](https://pinia.vuejs.org/) or another SSR-compatible state solution. kita's global model registry and singleton store pattern are not designed for the per-request isolation that SSR requires.

## Why an ORM on the frontend?

Most Vue state libraries give you reactive boxes (refs, stores, signals) and leave domain modeling to you — every component reaches into an axios client, maps raw JSON, and patches into a flat store. That works for small apps; it doesn't scale.

Kita takes the other approach, borrowed from Ember Data: treat the client as a thin mirror of your backend's data layer.

- **Models** describe *what a resource is* (its fields, computed properties, relations to other models)
- **Stores** describe *how to fetch, cache, and mutate* that resource
- **The registry** wires models to their stores automatically — `UserModel.create({ id: "1" })` knows to push itself into `UserStore`, and `userModel.save()` knows to POST to `/users/`

The result: when your backend already enforces a model (via Lucid, Prisma, etc.), kita lets you describe the *same model* on the client, in ~10 lines per resource. Adding a new field to a `UserModel` on both sides is a one-line change in two files.

## Influences

- **[Ember Data](https://github.com/emberjs/data)** — the model + store + registry pattern, automatic record identity, and the design goal of treating the client as an ORM-shaped cache of your backend
- **[axios](https://axios-http.com/)** — the `HttpClient` interface is axios-compatible by design
- **[SWR](https://swr.vercel.app/) / [TanStack Query](https://tanstack.com/query)** — the opt-in `AsyncStoreSWR` borrows their stale-while-revalidate semantics

Kita is *not* a fork of Ember Data — it's a much smaller, Vue-native take on the same ideas. No JSON:API requirement, no Ember runtime, no opinions about your bundler.

## Installation

```bash
pnpm add @ofrusch/kita
# or
npm install @ofrusch/kita
# or
yarn add @ofrusch/kita
```

Peer dependency: `vue@^3.0.0`.

## Quick start

### 1. Define a model

```ts
import { AsyncModel, registerModel } from "@ofrusch/kita";

export class UserModel extends AsyncModel {
  static readonly id = "users";
  static {
    registerModel(this);
  }

  declare email: string;
  declare name: string;
}
```

### 2. Define a store

```ts
import { AsyncStore, reactive } from "@ofrusch/kita";
import { UserModel } from "./UserModel";

export class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  @reactive()
  accessor currentUser: UserModel | null = null;

  async login(email: string, password: string) {
    const res = await this.client.post("/auth/login/", { email, password });
    this.currentUser = UserModel.create(res.data);
    return this.currentUser;
  }
}
```

### 3. Wire up the application store

```ts
import axios from "axios";
import { ApplicationStore, createAndRegisterStore } from "@ofrusch/kita";
import { UserStore } from "./stores/UserStore";

class AppStore extends ApplicationStore {
  declare readonly users: UserStore;
}

const client = axios.create({ baseURL: "/api" });

const { appStore, useStore } = createAndRegisterStore(AppStore, [UserStore], client);

export default appStore;
export { useStore };
```

### 4. Install on the Vue app

```ts
import { createApp } from "vue";
import App from "./App.vue";
import appStore from "./stores/application-store";

const app = createApp(App);
app.use(appStore);
app.mount("#app");
```

### 5. Use in components

```ts
import { computed } from "vue";
import { useStore } from "./stores/application-store";

const { users } = useStore();

const currentUser = computed(() => users.currentUser);

async function handleLogin() {
  await users.login("a@b.com", "password");
}
```

## Pairing with a backend ORM

A typical setup with a backend Lucid/Prisma/Sequelize model and a matching kita model:

```ts
// backend (AdonisJS Lucid)
export default class User extends BaseModel {
  @column({ isPrimary: true }) declare id: string;
  @column() declare email: string;
  @column() declare displayName: string;
  @hasMany(() => Post) declare posts: HasMany<typeof Post>;
}

// frontend (kita)
export class UserModel extends AsyncModel {
  static readonly id = "users";
  static { registerModel(this); }

  declare email: string;
  declare displayName: string;

  get posts() {
    return this.stores.posts.records.filter((p) => p.userId === this.id);
  }
}
```

The route `GET /users/:id` returning the Lucid model's `.toJSON()` lands as a fully-typed `UserModel` instance via `users.findRecord(id)`. Relations on the frontend resolve via `this.stores`. Saving works in reverse: `user.email = "new@..."; await user.save();` issues a `PUT /users/:id` with the serialized fields.

## The `@reactive` decorator

`@reactive()` converts a class field into a Vue-reactive property backed by a `ref()`. Use the Stage 3 `accessor` keyword and provide an initial value:

```ts
import { reactive, Store } from "@ofrusch/kita";

class FilterStore extends Store<FilterModel> {
  @reactive()
  accessor query: string = "";

  @reactive()
  accessor selectedTags: string[] = [];
}
```

Reads and writes go through Vue's reactivity system, so reactive properties trigger re-renders, `computed`, and `watch` exactly like a normal `ref`.

> The decorator argument is ignored — initial values come from the field initializer (`= ""`, `= []`, etc.). The argument is kept for backwards compatibility with the legacy `@reactive(value)` syntax.

## HTTP client

`AsyncStore` and `ApplicationStore` accept any client that matches the `HttpClient` interface:

```ts
export interface HttpClient {
  get<T>(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: T }>;
  post<T>(url: string, data?: unknown): Promise<{ data: T }>;
  put<T>(url: string, data?: unknown): Promise<{ data: T }>;
  delete<T>(url: string): Promise<{ data: T }>;
}
```

`AxiosInstance` satisfies this interface out of the box — no adapter required. Any other client (ky, redaxios, native fetch wrapper) works as long as it matches the shape.

## Utilities

All utilities are importable from `@ofrusch/kita`.

### `withOptimisticUpdate`

Update the UI immediately and roll back on server error:

```ts
import { withOptimisticUpdate } from "@ofrusch/kita";

await withOptimisticUpdate(
  () => {
    const snapshot = { votes: item.votes };
    item.votes += 1;
    return snapshot;
  },
  () => api.post(`/items/${item.id}/vote`),
  (snapshot) => {
    item.votes = snapshot.votes;
  },
);
```

`AsyncStore` also exposes `optimisticCreate`, `optimisticUpdate`, and `optimisticDelete` for record-level mutations.

### `RequestTracker`

Deduplicate concurrent in-flight requests:

```ts
import { RequestTracker } from "@ofrusch/kita";

const tracker = new RequestTracker();

const user = await tracker.dedupe(`user-${id}`, () => api.get(`/users/${id}`));
```

### `QueryCache`

TTL-based cache for list queries. `AsyncStore.findRecords` uses this internally and auto-invalidates on `_createRecord` / `_updateRecord` / `_deleteRecord`. Call `store.invalidateQueries()` after any custom mutation that changes the set of records.

```ts
import { QueryCache } from "@ofrusch/kita";

const cache = new QueryCache<Item>(60_000); // 1 minute TTL
cache.set({ q: "hello" }, results);
cache.get({ q: "hello" });
```

### `sortedSerialize`

The stable serialization behind every params-derived key — `QueryCache` and `findRecord` / `findRecords` request dedup all use it, so the same query always produces the same key regardless of how the params object was built. Keys are sorted at every level of nesting; array order stays significant. Functions, symbols, and cycles throw a `TypeError` rather than silently colliding.

```ts
import { sortedSerialize } from "@ofrusch/kita";

sortedSerialize({ page: 1, filter: { active: true, role: "admin" } }) ===
  sortedSerialize({ filter: { role: "admin", active: true }, page: 1 }); // true
```

### `PaginatedQuery`

Page-tracking helper for infinite scroll:

```ts
import { PaginatedQuery } from "@ofrusch/kita";

const query = new PaginatedQuery(async (page) => {
  const { records, meta } = await store.findRecords({ page });
  return { records, meta };
});

const firstPage = await query.loadMore();
query.hasMore; // boolean
query.isLoading; // boolean
```

`AsyncStore.createPaginatedQuery(params)` returns a pre-wired instance.

## Opt-in stale-while-revalidate

If you want SWR semantics on `findRecord` (return cached, refetch in background after `staleTime`), extend `AsyncStoreSWR` instead of `AsyncStore`:

```ts
import { AsyncStoreSWR } from "@ofrusch/kita";

class UserStore extends AsyncStoreSWR<UserModel> {
  static readonly id = "users";
}

// returns instantly if cached and < 30s old, else awaits the fetch
await users.findRecord("u-1", {}, { staleTime: 30_000 });

// returns instantly, kicks off a background refetch
await users.findRecord("u-1", {}, { revalidate: true });
```

The base `AsyncStore` has a smaller surface and simpler typing — pick `AsyncStoreSWR` only if you need freshness tracking.

## API reference

### Core

| Export                   | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `ApplicationStore`       | Container for domain stores; Vue plugin                   |
| `createStore`            | Factory for an app store without registering child stores |
| `createAndRegisterStore` | Factory that also registers child stores                  |
| `Store<T>`               | Base sync store                                           |
| `AsyncStore<T>`          | Base HTTP-backed store                                    |
| `AsyncStoreSWR<T>`       | Opt-in stale-while-revalidate variant of `AsyncStore`     |
| `AbstractStore<T>`       | Base of `Store` and `AsyncStore`                          |
| `Model`                  | Base sync model                                           |
| `AsyncModel`             | Base HTTP-backed model with `save()` / `delete()`         |
| `AbstractModel`          | Base of `Model` and `AsyncModel`                          |
| `registerModel`          | Register a model class with the global registry           |
| `reactive`               | `@reactive()` Stage 3 accessor decorator                  |
| `dataStorePlugin`        | Vue DevTools plugin (auto-installed by `ApplicationStore`) |

### Utilities

| Export                 | Purpose                              |
| ---------------------- | ------------------------------------ |
| `RequestTracker`       | Concurrent-request deduplication     |
| `QueryCache`           | TTL-based query cache                |
| `PaginatedQuery`       | Page-tracking for `loadMore` UIs     |
| `withOptimisticUpdate` | Optimistic update with auto-rollback |

### Types

| Export               | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `HttpClient`         | Minimal HTTP client interface            |
| `HttpResponse<T>`    | `{ data: T }`                            |
| `HttpRequestConfig`  | `{ params?: Record<string, unknown> }`   |
| `FindRecordOptions`  | SWR options (`AsyncStoreSWR`)            |
| `FindRecordsOptions` | `findRecords` cache options              |
| `PaginationMeta`     | Pagination response metadata             |
| `PaginatedResult<T>` | `{ records: T[], meta: PaginationMeta }` |

## Local development

The repo ships a `playground/` Vue 3 app pre-wired against the live source — edits to `src/` HMR into the running app with no publish or build step.

```bash
pnpm install
pnpm play   # starts vite on http://localhost:5174
```

The playground demonstrates `AsyncStore` (pagination + caching), `AsyncStoreSWR` (stale-while-revalidate), optimistic updates, and the Vue DevTools integration. It uses an in-memory `MockHttpClient` so it runs with no backend.

Other scripts:

| Script | What it does |
|---|---|
| `pnpm test` | Run the vitest suite (130 tests) |
| `pnpm typecheck` | Type-check the library source |
| `pnpm build` | Build `dist/` for publishing (ESM + CJS + `.d.ts`) |
| `pnpm dev` | tsup watch mode (rebuild `dist/` on save) |

## Requirements

- Vue 3
- TypeScript 5.0+ (for native Stage 3 decorators)
- Node 18+

## License

MIT © Owen Carpenter
