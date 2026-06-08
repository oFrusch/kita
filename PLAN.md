# Kita Pre-Launch Plan

Working plan for getting `@ofrusch/kita` ready for public promotion. Tracked in four batches; Batch 1 is in progress.

## Batch 1 — API hygiene + release readiness

Breaking API cleanup, infrastructure, and the bits required before we tell anyone about the package.

- [x] Symbol provide key (`KITA_STORE_KEY`) — replaces string-keyed `provide("store", ...)`
- [x] Protect `_createRecord` / `_updateRecord` / `_deleteRecord` on `AsyncStore`; add public `save(record)` / `delete(record)` that route on `record.isNew`
- [x] `AsyncModel.update(patch)` convenience method
- [x] `@deprecated` JSDoc on `connectToStore` (use `registerModel(this)` in a `static {}` block instead)
- [x] CI workflow (`.github/workflows/test.yml`) — Node 20/22/24 matrix, pnpm via `packageManager` field
- [x] Update tests for new public API
- [x] Issue templates (`bug.yml`, `feature.yml`, `config.yml`)
- [ ] `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- [x] Add `attw` (Are The Types Wrong) — `@arethetypeswrong/cli` devDep + `check:types` script (CI already calls it)
- [x] SPA-only documentation — prominent README warning + CHANGELOG entry, SSR deferred to 1.0
- [x] Bump version `0.1.1` → `0.2.0` (breaking: protected CRUD methods, Symbol provide key)
- [ ] Update vandal-app for new kita API (after publish)

## Batch 2 — Code organization + bundle

Splitting the larger files and trimming what ships to consumers.

- [x] Split `src/stores/index.ts` → `abstract-store.ts`, `store.ts`, `async-store.ts`
- [x] Split `src/models/index.ts` similarly
- [x] Lazy-load `@vue/devtools-api` so prod bundles can drop it
- [x] Bundle analysis pass (size-limit or similar), document baseline in CHANGELOG

## Batch 3 — Docs site

- [x] VitePress site under `docs/`
- [x] Cookbook: common patterns (pagination, optimistic updates, SWR, custom HttpClient)
- [x] Validation patterns (zod/valibot at the store boundary)
- [x] API reference (curated pages — chose hand-written over generated for a surface this small)

## Batch 4 — Hosted playground

- [ ] Deploy `playground/` to Vercel or Cloudflare Pages
- [ ] Link from README + docs site

## Notes

- SSR/multi-app support is explicitly out of scope for `0.x` — documented as SPA-only.
- `HttpClient` stays axios-duck-typed so `AxiosInstance` satisfies it structurally.
- Stage 3 decorators only — no `experimentalDecorators` path.
