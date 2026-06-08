# Changelog

All notable changes to `@ofrusch/kita` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## Unreleased

(nothing yet)

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
