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

The suite has 138 tests across 10 files covering every public class — `@reactive`, `ModelStoreRegistry`, `Model`, `AsyncModel`, `Store`, `AsyncStore`, `AsyncStoreSWR`, `ApplicationStore`, and the four utility classes (`RequestTracker`, `QueryCache`, `PaginatedQuery`, `withOptimisticUpdate`).

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

### Code style

`pnpm lint` (oxlint) and `pnpm format:check` (oxfmt) must both pass. Beyond what those
enforce, two conventions the formatter does not catch — match the surrounding code:

- **Vertical whitespace separates logical groups.** Put blank lines between a block of
  declarations, guard clauses, and the final return. Code should breathe. For example:

  ```ts
  function myFunc(z: number): boolean {
    const x = 1
    const y = 2

    if (!z) return false

    return x + y < z
  }
  ```

  rather than the same body packed with no blank lines between the declarations, the
  guard, and the return.

- **Functional array methods over imperative loops.** Prefer `.map` / `.filter` /
  `.reduce` / `.forEach` over `for` / `while` when there's a clean functional equivalent
  (a transform, filter, or accumulation).

## Publishing a release

The package is published to npm as `@ofrusch/kita`.

```bash
# 1. bump the version — semver:
#    - patch (0.0.x): bugfixes, non-breaking type improvements
#    - minor (0.x.0): new public API, opt-in features (and breaking changes pre-1.0)
#    - major (x.0.0): breaking changes
#    edit BOTH package.json and the version label in docs/.vitepress/config.ts

# 2. roll CHANGELOG.md
#    rename "## Unreleased" to "## <version> — <YYYY-MM-DD>", add a fresh
#    empty "## Unreleased" above it, and edit the entry for consumers

# 3. ensure quality — all must be green
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build          # produces dist/ — ESM, CJS, .d.ts
pnpm check:types    # attw
pnpm size           # size-limit budgets

# 4. commit and push
git commit -am "chore | release v<version>" && git push origin main

# 5. publish (prepublishOnly hook re-runs the build)
pnpm publish --access public

# 6. tag and cut the GitHub release, with notes taken from the changelog entry
git tag -a v<version> -m "v<version>" && git push origin v<version>
gh release create v<version> --title "v<version>" --notes-file <notes>
```

The `files` field in `package.json` controls what ends up in the published tarball:

```json
"files": ["dist", "src", "README.md", "LICENSE"]
```

`src/` is included so consumers can debug into source maps; the runtime entry is `dist/`.

## Performance benchmarks

kita has a runtime perf-regression gate (`.github/workflows/perf.yml`) built on
deterministic **instruction counting** — no wall-clock timing, no third-party
service. Each hot path is run at N and 2N iterations under `valgrind --tool=callgrind`
with `node --predictable`; subtracting (`Δ = Ir(2N) − Ir(N)`) cancels Node startup
and JIT warm-up, leaving a stable per-iteration instruction count. A committed
`bench/baseline.json` is the comparison basis.

### Running benchmarks locally

You need valgrind. With sudo: `sudo apt-get install -y valgrind`. Without sudo
(e.g. some WSL setups): `bash bench/harness/bootstrap-valgrind.sh` installs a
rootless copy into `bench/.valgrind/`.

- `pnpm bench` — build the harness, run every gate case, compare to the baseline,
  print the table (exit 1 on a ≥3% regression).
- `pnpm bench:update` — regenerate `bench/baseline.json` (do this only on the
  pinned CI toolchain, or via the **perf-baseline** workflow, so numbers match CI).

### Updating the baseline

Instruction counts are deterministic for a fixed (node, valgrind) pair, so the
baseline only changes when perf genuinely changes (or the toolchain is bumped).
When a PR legitimately shifts a hot path, trigger the **perf-baseline** GitHub
Actions workflow (`workflow_dispatch`); it regenerates the baseline on the pinned
toolchain and opens a PR with the new numbers. Merge that alongside your change.

### Writing a benchmark case

Cases live in `bench/cases/*.bench.ts` (TypeScript, because they use kita's
`@reactive accessor` decorators) and are AOT-bundled with esbuild — plain `node`
can't parse decorators. A case exports `setup()` (build fixtures once) and
`body(state)` (one hot operation). Rules that keep the differential valid:

- **No unbounded growth.** Repeatedly calling `body` on the same state must not
  grow a Map/array/registry — that breaks linearity. Use fresh-per-call objects
  (discarded, GC'd) or push-then-remove. In particular, never push into the
  shared `ModelStoreRegistry` singleton across iterations.
- **Body-dominated.** The per-iteration cost must be dominated by the code under
  test, not loop/call overhead — otherwise a real regression under-reports. If a
  body is very cheap, make it do more work per call.
- **Size it hot.** Tiny workloads are JIT-unstable; keep each case's total work
  well above trivial. New cases must resolve an injected ~3% (see
  `tests/bench-sensitivity.test.ts`) before you trust them.

Register new cases in both `bench/cases/index.ts` (implementation) and
`bench/harness/cases.mjs` (gate list + iteration count), then re-baseline.

## Branch and PR conventions

- One feature per PR. Keep the diff reviewable.
- **Squash on merge** — so the PR title becomes the commit message. Title format:
  **`<type> | <summary>`**, where `<type>` is one of `feat`, `chore`, `bug`, `perf`
  (performance). A pipe separates type and summary, e.g. `feat | preserve query meta across findRecords cache hits`.
- **PR body** has three sections:
  - **What** — what is materially changed.
  - **Why** — why the change was made.
  - **How** — the mechanics: high-level design and the idea behind it, no deep code
    references.
- Reference the issue if there is one (`Closes #N`).

## Working on the playground itself

The playground is its own workspace (`kita-playground`). When you update components, models, or stores under `playground/src/`, you don't need to publish or rebuild the library — just edit and watch HMR.

When you add a new library feature you want to showcase, add a new component to the playground demonstrating it. The playground doubles as living documentation.

## Questions

Open an issue. The maintainer reads them.
