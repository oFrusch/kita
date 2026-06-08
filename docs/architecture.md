# kita architecture

This is a tour of how kita's pieces fit together — useful when you're about to make a non-trivial change and want to know what touches what.

## Layered view

```
                  ┌───────────────────────────────────────────┐
                  │              Your Vue app                 │
                  │   computed(() => store.users.records)     │
                  │   await user.save()                       │
                  └───────────────────┬───────────────────────┘
                                      │
                  ┌───────────────────▼───────────────────────┐
                  │           ApplicationStore                │  ← Vue plugin
                  │   container for domain stores             │     install() wires
                  │   { users: UserStore, todos: TodoStore }  │     provide / globals
                  └───────────────────┬───────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
   ┌────────▼─────────┐    ┌──────────▼──────────┐    ┌─────────▼─────────┐
   │     Store<T>     │    │    AsyncStore<T>    │    │ AsyncStoreSWR<T>  │
   │  sync, in-mem    │    │ HTTP CRUD + cache + │    │ extends AsyncStore│
   │                  │    │ dedup + optimistic  │    │ adds staleTime    │
   └────────┬─────────┘    └──────────┬──────────┘    └─────────┬─────────┘
            │                         │                         │
            └─────────────────────────┴─────────────────────────┘
                                      │
                  ┌───────────────────▼───────────────────────┐
                  │            AbstractModel                  │
                  │       Model            AsyncModel         │
                  │       (sync)           (HTTP, save/del)   │
                  └───────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────┐
                          │ ModelStoreRegistry  │  ← module-level singleton
                          │  models  → classes  │     links AsyncModel.create()
                          │  stores  → instances│     back to its store
                          └─────────────────────┘
```

## The lifecycle of a single request

`PlacePage.vue` calls `placeStore.findRecord("p-1")`. Tracing what happens:

```
findRecord("p-1")                                   AsyncStore
   │
   ├─ check _recordsById.get("p-1")
   │     ↳ hit?  return cached, done.
   │     ↳ miss: continue
   │
   ├─ _fetchAndCacheRecord("p-1", {})              ← protected, SWR overrides this
   │
   ├─ requestTracker.dedupe("findRecord:p-1:...", fn)
   │     ↳ if another findRecord("p-1") is mid-flight,
   │       return the existing promise (no second request)
   │
   ├─ client.get("/places/p-1/", { params: {} })   ← HttpClient call
   │     ↳ user-supplied (axios, ky, mock, …)
   │
   ├─ res.data → modelType.create(...)              ← AsyncModel.create
   │     ↳ looks up store via ModelStoreRegistry
   │     ↳ calls store._pushRecord(self) — merge into _recordsById
   │
   └─ return the record (existing if it already had an entry by id,
      else the freshly-created one)
```

Three subsystems collaborate per request:

1. **`_recordsById` Map** — the local cache. Lookups are O(1). Records are merged in-place via `Object.assign` so existing Vue refs holding the record keep pointing at the same object.
2. **`RequestTracker`** — dedup. Keyed by `"findRecord:<id>:<JSON.stringify(params)>"`. The promise gets dropped from the map when it settles.
3. **`QueryCache`** — TTL'd response cache for `findRecords` (not `findRecord`). Auto-invalidated whenever `_createRecord` / `_updateRecord` / `_deleteRecord` succeeds.

## Why the registry is a module-level singleton

`AsyncModel.create()` needs to find the store for its model type *without* the caller passing it in:

```ts
const user = UserModel.create({ id: "1", email: "a" });
// internally: store = ModelStoreRegistry.getStore("users")
// → store._pushRecord(user)
```

Without a singleton, every model would need a `static store` field or constructor injection. The singleton is the trade-off: it makes the developer API trivial at the cost of global state.

**Implications:**

- The registry is shared across the entire process.
- Tests must reset it between cases. See `tests/helpers.ts#resetRegistry`.
- Two `ApplicationStore` instances would step on each other. In practice, apps create exactly one.

If multi-instance support ever becomes a requirement, the right move is to make the registry instance-level on `ApplicationStore` and pass it through to `AsyncModel.create` via a context. We deliberately chose not to do this in 0.x because every consumer wants the simpler API.

## The `@reactive` decorator

Stage 3 accessor decorators (TC39 March 2022 proposal). The signature is:

```ts
function reactive(_defaultValue?: unknown) {
  const instanceRefs = new WeakMap<object, Ref<unknown>>();

  return function <This extends object, T>(
    _target: ClassAccessorDecoratorTarget<This, T>,
    _context: ClassAccessorDecoratorContext<This, T>,
  ): ClassAccessorDecoratorResult<This, T> {
    return {
      get(this: This): T {
        return instanceRefs.get(this)!.value as T;
      },
      set(this: This, value: T): void {
        const localRef = instanceRefs.get(this) ?? ref(value);
        if (!instanceRefs.has(this)) instanceRefs.set(this, localRef);
        else localRef.value = value;
      },
      init(this: This, value: T): T {
        instanceRefs.set(this, ref(value));
        return value;
      },
    };
  };
}
```

Two important details:

1. **`WeakMap<This, Ref>` keyed by instance.** Pre-Stage-3 implementations often used a closed-over `ref` in the decorator factory — that ref was shared across every instance of the class, a real bug. The WeakMap is the fix.
2. **`init` hook captures the field initializer.** The class field's initial value (`accessor x: number = 42`) flows into the WeakMap's first `set`. This is what lets `@reactive()` ignore its decorator argument and source the default from `= ...`.

## AsyncStoreSWR override strategy

`AsyncStoreSWR` extends `AsyncStore` and overrides exactly two methods:

```ts
class AsyncStoreSWR<T extends AsyncModel> extends AsyncStore<T> {
  protected recordTimestamps = new Map<string, number>();

  // overrides AsyncStore.findRecord — adds staleTime logic
  public async findRecord(id, params?, options?: FindRecordOptions | boolean) { … }

  // overrides AsyncStore._fetchAndCacheRecord — stamps timestamp after super call
  protected async _fetchAndCacheRecord(id, params) {
    const record = await super._fetchAndCacheRecord(id, params);
    this.recordTimestamps.set(id, Date.now());
    return record;
  }
}
```

The base `AsyncStore` makes `_fetchAndCacheRecord` and `requestTracker` `protected` so subclasses can hook in. Adding more behaviors (e.g. a `RetryStore` with exponential backoff, or a `ThrottledStore` with rate-limiting) follows the same pattern: extend, override one or two methods, call `super` where appropriate.

## File layout

```
src/
├── application-store.ts    ApplicationStore + createStore/createAndRegisterStore
├── model-store-registry.ts ModelStoreRegistry singleton
├── decorators/
│   └── reactive.ts         @reactive Stage 3 decorator
├── models/index.ts         AbstractModel / Model / AsyncModel / registerModel
├── stores/index.ts         AbstractStore / Store / AsyncStore
├── swr/index.ts            AsyncStoreSWR
├── http/index.ts           HttpClient / HttpResponse / HttpRequestConfig
├── devtools/               Vue DevTools plugin
└── utils/                  RequestTracker / QueryCache / PaginatedQuery / withOptimisticUpdate
```

A few of these — `models/index.ts`, `stores/index.ts` — are barrel files holding multiple classes. The original `vandal-app` placed each class in its own file; the consolidated barrels are easier to navigate because the classes form a tight inheritance hierarchy and reading them together gives more context than chasing imports.

## Things that *aren't* kita's concern

- **Schema validation.** Kita assumes API responses match the model's declared fields. If the API drifts, runtime bugs surface as `undefined` reads, not at the kita layer. Pair with zod or your validation library of choice at the HTTP boundary if you need it.
- **Relationships.** There's no `@hasMany` / `@belongsTo`. You get the registry, so you wire relations yourself with `get posts() { return this.stores.posts.records.filter(p => p.userId === this.id); }` and you decide how clever to be (memoize, cache, etc.).
- **Authentication.** The `HttpClient` interface doesn't carry an auth token. Bake auth into your client (axios interceptor, fetch wrapper) — kita stays out of it.
- **Persistence across reloads.** Records live in memory only. If you need offline / restore, layer that on top.

Keeping these out is deliberate. Each one is a project-sized concern that deserves a dedicated library; bundling them in would make kita harder to drop into a project that already has a preferred answer for each.
