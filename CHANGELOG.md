# Changelog

All notable changes to `@ofrusch/kita` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## Unreleased

### Breaking Changes

- Minimum supported Node.js is now **22** (`engines.node: ">=22"`, was `>=20`). The build toolchain (pnpm 11) requires Node 22.13+, and CI no longer tests Node 20.
- `AsyncStore.optimisticCreate` no longer routes through `_createRecord`; it now calls the new `_postRecord` hook directly and manages store membership itself. Subclasses that hooked the create path by overriding `protected _createRecord` will find that override **silently skipped on the optimistic path** (it still runs for `save()` / `model.save()`). Move such hooks to `_postRecord`, which is shared by both create paths.
- `AsyncStore.optimisticCreate` now throws if the store already holds the instance under its current id. Previously it POSTed a duplicate row to the server and pushed the instance into `records` twice. Use `save()` to re-persist an existing record.

### Fixed

- `AsyncStore.optimisticCreate` now puts the **record instance** in the store while the POST is in flight, instead of a plain-object spread clone. The pending record keeps its prototype, so `record instanceof Model` holds and model methods survive. It also stays in `records` for the whole round-trip (no remove-and-re-add flicker, no duplicate entry), with only its `_recordsById` key swapped from the temporary id to the server id. Note the pending record carries the temporary id, so it is **not** `isNew` mid-flight — do not call `save()` / `delete()` on it until the create settles.
- `AsyncStore.optimisticCreate` temporary ids come from a per-store counter rather than `Date.now()`, which collided for two creates in the same millisecond and merged the second record into the first.
- `AsyncStore.optimisticCreate` deduplicates re-entrant calls for the same instance (a double-submitted form): the second call joins the in-flight request instead of issuing a second POST that would carry the temporary id in its body and push the instance into `records` twice.
- `AsyncStore.optimisticCreate` reconciles against an existing record when the server returns an id already held in the store (a concurrent `findRecords`, or an upsert endpoint echoing an existing row): it merges into the incumbent instead of leaving two array entries under one id.
- `AsyncStore._postRecord` merges the server response through the record's reactive proxy. `records` stores raw targets, so assigning straight onto the instance bypassed the set trap and an optimistic create never re-rendered — the row stayed on its `temp_*` id until some unrelated mutation forced a redraw.
- `AsyncModel.create(...)` no longer eagerly registers an id-less draft in its store (it was stored under an `undefined` key). Combined with the fix below, `Model.create({...}); await model.save()` now leaves exactly one record in the store.
- `AsyncStore._createRecord` now merges the server response onto the saved record and stores that model instance, instead of pushing the raw response JSON as a second, non-model record. Fixes duplicate records after a create+save.
- `AsyncStore.createPaginatedQuery` no longer routes through the record-only query cache, which dropped pagination `meta` on a cache hit and made `hasMore` collapse to `false` after a reset.
- `PaginatedQuery` state (`hasMore` / `isLoading` / `page` / `totalCount` / `totalPages`) is now backed by Vue refs, so it stays reactive in components — fixes a stuck "loading" state when the query is held in a `ref`/`shallowRef`.
- `AsyncStore.findRecords` now returns response `meta` on a cache hit, not just on the first fetch. The query cache previously stored records only, so a cached paginated query lost its `meta` (and `hasMore`/`totalCount` with it).
- `QueryCache` no longer grows without bound. Expiry was lazy and per-key — an entry was only dropped when that exact key was read again — so a key written once and never re-read lived for the life of the page. Every `set` now sweeps expired entries and evicts the oldest once the cache is over `maxSize` (default 100).

### Added

- `AsyncStore._postRecord(record, payload?)` — a new `protected` override point carrying the bare POST-and-merge, split out of `_createRecord` and shared with `optimisticCreate`. Overriding it hooks both create paths at once.
- `QueryCache` can now store response metadata alongside records: `set(params, data, meta?)` plus a new `getEntry(params, ttl?)` that returns `{ data, meta }`. `get()` is unchanged. The class gains an optional second type param (`QueryCache<T, M>`, `M` defaults to `Record<string, unknown>`).
- `QueryCacheOptions` (`{ ttl?, maxSize? }`) is now public, and `new QueryCache({ ttl, maxSize })` configures both. The `new QueryCache(30_000)` numeric-TTL form still works.
- `set(params, data, meta?, ttl?)` takes an optional per-entry TTL. The expiry sweep honours each entry's own lifetime, so an entry written with a longer TTL survives writes to unrelated keys — this is what makes `AsyncStore.findRecords`' `cacheTTL` option hold beyond the cache's 60s default.

### Changed

- **Potentially breaking:** `QueryCache`'s `ttl` and `maxSize` must each be a positive integer. Values that were silently accepted before — `new QueryCache(0)`, a negative or fractional TTL — now throw a `RangeError` at construction rather than producing a cache that never stores anything.
- **Potentially breaking:** `AsyncStore`'s internal query cache is now bounded to 100 entries (previously unbounded). A store that caches more than 100 distinct param sets will now evict the oldest; raise it by passing `maxSize` to a `QueryCache` you own.
- Internal refactor: `src/stores/index.ts` and `src/models/index.ts` split into per-class modules (`abstract-store.ts`/`store.ts`/`async-store.ts` and `abstract-model.ts`/`model.ts`/`async-model.ts`). The barrel re-exports are unchanged, so this is invisible to consumers.
- `@vue/devtools-api` is now lazy-loaded via a dynamic `import()` behind a `process.env.NODE_ENV !== "production"` guard, so production consumer bundles tree-shake it out entirely.

### Notes

- **Bundle size baseline** (gzip/brotli, peer deps excluded, measured with [size-limit](https://github.com/ai/size-limit) — run `pnpm size`):
  - Full public surface (`import * as kita`): **3.74 kB**
  - Typical quick-start import (`ApplicationStore`, `AsyncModel`, `AsyncStore`, `registerModel`, `reactive`, `createAndRegisterStore`): **3.33 kB**

## 0.2.0 — 2026-06-08

### Breaking Changes

- `AsyncStore._createRecord`, `._updateRecord`, `._deleteRecord` are now `protected`. Use the new public `save(record)` and `delete(record)` methods, which route automatically based on `record.isNew`.
- The Vue provide key for the application store is now a Symbol (`KITA_STORE_KEY`) instead of the string `"store"`. Update any `inject("store", ...)` calls to `inject(KITA_STORE_KEY, ...)`.

### Added

- **SPA-only scope documented** — kita targets client-side SPAs; SSR and multi-app support are explicitly out of scope for `0.x` and deferred to `1.0`.
- `playground/` directory with a Vue 3 + Vite testbed for local development. Aliases `@ofrusch/kita` to live source so changes HMR without rebuilding.
- `CONTRIBUTING.md` and `docs/architecture.md` covering local workflow, conventions, and internals.

### Changed

- `Model.create<T, U>` and `AsyncModel.create<T, U>` now use polymorphic `this` for inference. Calls like `UserModel.create({ email: "a" })` now return `UserModel & { email: string }` instead of just `Model`. **Non-breaking improvement** — strictly stronger inference; existing call sites only get better types.
- `ApplicationStore.getStore<T>` constraint loosened. The previous `T extends Store<Model>` rejected `AsyncStore` subclasses; the new default `T = Store<Model> | AsyncStore<AsyncModel>` accepts both.

## 0.1.1 — 2026-06-08

### Added

- `HttpRequestConfig.signal?: AbortSignal` for request cancellation.
- `HttpRequestConfig.headers?: Record<string, string>` for per-request headers.

### Changed

- `HttpRequestConfig.params` loosened from `Record<string, unknown>` to `any` to match axios's interface and accept named param types without index signatures.

## 0.1.0 — 2026-06-08

### Added

- Initial public release.
- `ApplicationStore`, `createStore`, `createAndRegisterStore` — container for domain stores; Vue plugin.
- `Store<T>`, `AsyncStore<T>` — sync and HTTP-backed stores.
- `AsyncStoreSWR<T>` — opt-in stale-while-revalidate variant.
- `Model`, `AsyncModel`, `AbstractModel`, `registerModel` — model classes with automatic store registration.
- `@reactive` Stage 3 accessor decorator backing class fields with Vue `ref()`s, with per-instance state via `WeakMap`.
- `HttpClient` interface — duck-typed, axios-compatible; works with any client matching the shape.
- Utilities: `RequestTracker`, `QueryCache`, `PaginatedQuery`, `withOptimisticUpdate`.
- Vue DevTools integration via `dataStorePlugin`.
- ESM + CJS dual build with `.d.ts` types.

[unreleased]: https://github.com/ofrusch/kita/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ofrusch/kita/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/ofrusch/kita/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ofrusch/kita/releases/tag/v0.1.0
