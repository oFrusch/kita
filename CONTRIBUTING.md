# Contributing to kita

Thanks for your interest. Kita is a small library — most changes touch only a few files. This guide covers the development workflow, conventions, and the release process.

## Local setup

```bash
git clone <repo>
cd kita
pnpm install
```

This installs the library's dev deps **and** sets up the `playground/` workspace via pnpm. The playground is your live testbed.

## The two ways to test changes

### 1. Unit tests (vitest)

The source of truth for correctness. Run them in watch mode while you work:

```bash
pnpm test:watch    # watches src/ + tests/, re-runs affected files
```

For a one-shot full run:

```bash
pnpm test
```

The suite has 130 tests across 10 files covering every public class — `@reactive`, `ModelStoreRegistry`, `Model`, `AsyncModel`, `Store`, `AsyncStore`, `AsyncStoreSWR`, `ApplicationStore`, and the four utility classes (`RequestTracker`, `QueryCache`, `PaginatedQuery`, `withOptimisticUpdate`).

When you add a new feature or public method, add at least one test before opening the PR.

### 2. The playground (manual smoke testing)

When you want to see your changes in a real Vue app — interact with the DevTools panel, watch optimistic updates flash, click through pagination — use the playground:

```bash
pnpm play    # vite dev server on http://localhost:5174
```

Vite is configured to alias `@ofrusch/kita` directly to `src/index.ts`. Edits to library source trigger HMR in the playground within ~50ms. **No `pnpm build` needed during development** — the dist directory is only relevant for publishing.

The playground uses an in-memory `MockHttpClient` with artificial 200ms latency so loading states and optimistic flashes are observable without a real backend. See [`playground/README.md`](./playground/README.md) for what it demonstrates and how to extend it.

## Code conventions

- **TypeScript strict mode.** `pnpm typecheck` must pass before merge.
- **No `any` in public types.** Internal `any` casts (e.g. `client.get<any>`) are fine for HTTP boundaries where response shapes are inherently unknown to the library.
- **No type assertions in test code.** If a test needs `as Foo`, that usually points at a real typing gap in the library — fix the library, not the test. (See the Model.create polymorphic-`this` refactor as the canonical example.)
- **One file per public class.** `models/` and `stores/` keep each class in its own file behind a barrel `index.ts` that re-exports them — see [`docs/guide/architecture.md`](./docs/guide/architecture.md).
- **No comments explaining what the code does.** Names should do that work. Only comment the *why* when it's non-obvious (a workaround, a constraint, a perf invariant).

## Publishing a release

The package is published to npm as `@ofrusch/kita`.

```bash
# 1. bump the version
#    edit kita/package.json — semver:
#    - patch (0.1.x): bugfixes, non-breaking type improvements
#    - minor (0.x.0): new public API, opt-in features
#    - major (x.0.0): breaking changes

# 2. ensure quality
pnpm test           # all 130 must pass
pnpm typecheck      # clean
pnpm build          # produces dist/ — ESM, CJS, .d.ts

# 3. publish (prepublishOnly hook re-runs the build)
pnpm publish --access public

# 4. update CHANGELOG.md
#    add an entry under the new version describing what changed
```

The `files` field in `package.json` controls what ends up in the published tarball:

```json
"files": ["dist", "src", "README.md", "LICENSE"]
```

`src/` is included so consumers can debug into source maps; the runtime entry is `dist/`.

## Branch and PR conventions

- One feature per PR. Keep the diff reviewable.
- Squash on merge. Commit messages should follow conventional-commit style (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Reference the issue if there is one.

## Working on the playground itself

The playground is its own workspace (`kita-playground`). When you update components, models, or stores under `playground/src/`, you don't need to publish or rebuild the library — just edit and watch HMR.

When you add a new library feature you want to showcase, add a new component to the playground demonstrating it. The playground doubles as living documentation.

## Questions

Open an issue. The maintainer reads them.
