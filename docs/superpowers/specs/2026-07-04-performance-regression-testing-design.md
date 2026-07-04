# Performance-regression testing in CI — design

**Date:** 2026-07-04
**Status:** approved, ready for implementation planning

## Goal

Catch **runtime** and **bundle-size** regressions on every PR, deterministically,
with **zero third-party services**. A PR that makes a hot path meaningfully slower
(or the bundle meaningfully larger) should be visible in CI before it merges.

## Background

kita already has CI (`.github/workflows/test.yml`): lint/format, a Node 20/22/24 test
matrix, typecheck, build, `attw`, and playground typecheck. Two gaps:

- **No runtime benchmarks exist.** Runtime perf-regression testing is entirely new.
- **`size-limit` is configured but unused.** `.size-limit.js` defines bundle budgets
  but nothing runs `pnpm size` in CI, and the entries have no `limit` values, so even
  run manually it only reports — it never fails.

## Key decisions & rationale

### 1. Runtime measurement = deterministic instruction counting, not wall-clock

Wall-clock timing on shared GitHub-hosted runners is too noisy to catch anything but
gross (~20 %+) regressions. Deterministic **instruction counting** via Valgrind
(Callgrind) counts retired instructions under CPU simulation, so the same code yields
the same count on any machine — a 3 % change is a real 3 % signal, not runner noise.
This is the same technique CodSpeed uses.

### 2. Self-hosted, not CodSpeed the service

CodSpeed would give this for ~zero maintenance, but requires installing a third-party
GitHub App with repo access + a `CODSPEED_TOKEN` secret. The maintainer declined that
external dependency. A feasibility spike (2026-07-04) confirmed self-hosting is viable
and cheaper than first estimated — see "Spike evidence" below.

Note: even if we later reuse CodSpeed's measurement code, no App/token is needed —
`@codspeed/core`'s Callgrind path is Apache-2.0 and fully offline (the token is only for
uploading to their dashboard). We are choosing not to depend on it at all.

### 3. Runtime method = differential subtraction (no native addon)

Two self-hosted flavors were evaluated:

- **Differential (chosen):** run the same hot loop at N and 2N iterations, subtract.
  Needs only `valgrind` + `node` — no native code, keeps kita pure-TypeScript.
- **Reuse `@codspeed/core`'s prebuilt addon offline (rejected):** one run per bench
  instead of two, but adds a devDependency driven off its documented path (breaks if
  they change internals).

The differential method's only real cost is doubled runs (trivial on a non-blocking
job). The attribution caveat (below) applies equally to both, so it is not a
differentiator.

### 4. Bundle-size gate = wire in the existing `size-limit`

Fully self-hosted, deterministic bytes, uses the auto-provided `GITHUB_TOKEN`. Runtime
and size catch different regressions; both are cheap to run.

## The differential measurement, precisely

A single Callgrind run counts **every** instruction the process executes, dominated by a
large fixed pedestal irrelevant to the benchmark — Node/V8 startup, module load, JIT
warm-up (~225 M instructions in the spike). For a case whose per-iteration cost is `c`:

```
Ir(N)  = FIXED + N × c
Ir(2N) = FIXED + 2N × c
Δ = Ir(2N) − Ir(N) = N × c        # FIXED cancels exactly
```

Δ isolates the pure per-iteration cost of the code under test, discarding the startup
pedestal that would otherwise swamp the signal. Equivalently, we measure the **slope** of
instructions-vs-iterations and throw away the y-intercept — and a regression *is* a change
in slope, so 100 % of the signal is retained. In the spike, a 3 % code regression that
would have been a diluted 0.27 % blip in `Ir(N)` became a clean full-magnitude 3 % change
in Δ.

The method assumes an **affine** model (fixed cost + constant per-iteration cost):

1. `FIXED` must be identical across the N and 2N runs → `node --predictable` is
   **mandatory** (default V8 flags swing ~90 % run-to-run).
2. `c` must not drift with iteration count. A mild systematic non-linearity (~1.6 % in
   the spike, from int→heap-number boxing) is fine because it is identical on the base
   and PR at the same N/2N config, so it cancels in the regression comparison; it only
   perturbs the absolute per-iteration figure, never the delta-vs-baseline.

## Spike evidence (2026-07-04)

Empirical, run on this machine (Node v24.16.0) under genuine Callgrind (valgrind 3.26,
obtained rootless via `apt-get download` + `dpkg-deb -x` + `VALGRIND_LIB`):

- **Deterministic** with `node --predictable`: run-to-run spread ~0.0002–0.003 %
  (a few hundred instructions out of ~22 M).
- **Sensitive**: injected regressions tracked cleanly — +3 % → +2.96 %, +10 % → +9.88 %,
  +100 % → +99.76 %. A 3 % regression sits ~30,000× above the noise floor.
- **`--predictable` is non-negotiable**: without it, `Ir(N)` over 3 runs was
  243 M / 284 M / 148 M — a ~90 % swing.
- Node 24 ran clean under valgrind 3.26 across ~50+ runs (no SIGILL / unhandled
  instruction).

## Architecture

### Part A — Runtime gate: differential Callgrind

```
bench/
  harness/
    run-case.mjs      # `node --predictable` entry: import a case, warm up, loop body() the requested N times
    measure.mjs       # run a case at N & 2N under valgrind, parse Ir from the `summary:` line, return Δ
    compare.mjs       # Δ_pr vs baseline → per-case % + pass/warn/fail + PR-comment table
  cases/
    reactive.bench.mjs      # model construction + reactive get/set
    store-push.bench.mjs    # _pushRecord / normalization / peekRecord (bulk 1k)
    query-cache.bench.mjs   # QueryCache set/get + RequestTracker.dedupe
    pagination.bench.mjs    # createPaginatedQuery + optimistic apply/rollback
  baseline.json       # committed per-case Δ, refreshed by the re-baseline workflow
```

A **case** exports fixture setup (run once) and a hot `body()` (the measured operation).
Cases import from `src/` — like tests — so no build step is needed. Node runs with
`--predictable --no-concurrent-recompilation`.

**Benchmark cases** cover the four agreed hot-path areas:

| Case | Exercises | Source |
| --- | --- | --- |
| `reactive` | `new Model()` + reactive-decorator get/set | `src/decorators/reactive.ts`, `src/models/*` |
| `store-push` | `_pushRecord`, normalization, `peekRecord` (bulk 1k) | `src/stores/*`, `src/model-store-registry.ts` |
| `query-cache` | `QueryCache` set/get (sorted-key), `RequestTracker.dedupe` | `src/utils/query-cache.ts`, `request-tracker.ts` |
| `pagination` | `createPaginatedQuery`, optimistic apply/rollback | `src/utils/pagination.ts`, `optimistic.ts` |

### Part B — Bundle-size gate: size-limit

Wire the existing `.size-limit.js` into CI via **`andresz1/size-limit-action`** (uses
`GITHUB_TOKEN`, no external service). It builds PR + base, comments the **relative** byte
delta per entry, and fails if a budget is exceeded. Add `limit` fields to `.size-limit.js`
(current measured size + small headroom).

### Part C — CI wiring

New workflow **`.github/workflows/perf.yml`** with two jobs:

- `runtime` — the differential Callgrind gate. On `pull_request` it compares against the
  committed baseline; on push to `main` it runs as a **canary** (confirms `main` still
  matches its own baseline and surfaces drift). It never writes the baseline — that is the
  re-baseline job's job (see Baseline strategy). Single pinned Node version + pinned
  valgrind.
- `size` — `size-limit-action`. Runs on `pull_request`.

Existing `test.yml` is untouched. Both jobs are **non-blocking initially** (inform-first).

### Part D — Scripts & docs

- `package.json`: add `"bench"` (run the harness locally, print per-case Δ) and
  `"bench:update"` (regenerate the baseline). `"size"` already exists.
- `CONTRIBUTING.md`: how the gate works; running `pnpm bench` locally **including the
  rootless-valgrind trick for no-sudo machines**; how to re-baseline; and the
  **benchmark-authoring discipline** (below).

## Baseline strategy

Instruction counts are deterministic given a **pinned (node, valgrind) pair**, so we
commit `bench/baseline.json` and the PR gate compares against it in a **single run**
(no base-branch checkout). The baseline diff is visible in code review — a feature, not
noise. It is refreshed by a manual **`workflow_dispatch` "Re-baseline"** job that runs on
the pinned toolchain and opens a PR with the new numbers, guaranteeing parity with the
gate's environment.

## Thresholds & enforcement

Per-case, comparing PR Δ against baseline Δ:

- `warn` at ≥ 1 %
- `fail` at ≥ 3 %

**Inform-first:** the job posts a PR comment but stays **non-blocking** until we have
watched a few PRs and trust the baseline; then it is promoted to a required check via
branch protection.

## Toolchain pinning

The runtime gate runs on **one** Node version (not the full 20/22/24 matrix) with a pinned
valgrind ≥ 3.24 (Node 24 needs it; ubuntu-24.04 ships ~3.22). The exact pair is chosen at
implementation time — likely **Node 22 + distro valgrind** for zero friction, or Node 24 +
an installed valgrind 3.26. The baseline must be generated on the same pinned pair.

## Benchmark-authoring discipline

The measurement mechanism is solved; the ongoing cost is bench design. Every case must:

- Be **JIT-optimized**: put the code under test in a function called repeatedly with a
  warm-up phase, not a top-level loop that stays in the interpreter.
- Be **sized large / hot** (well above ~50 k instructions) — small benches are
  JIT-unstable even under a deterministic simulator.
- Be **dominated by the code under test**, not loop/call/boxing overhead — otherwise a
  real p % regression under-reports (the spike's "hot2 anomaly": a 2×-heavier arithmetic
  kernel read *lower* because per-iteration cost was overhead, not arithmetic).

## Risks

1. **`--predictable` mandatory** — enforced in the harness; default V8 swings ~90 %.
2. **Benchmark-design discipline** is the real recurring cost (see above).
3. **Valgrind ↔ Node version coupling** — old valgrind + new V8 → SIGILL; pin ≥ 3.24.
4. **Empirical gap** — spike numbers came from a rootless-extracted valgrind, never a
   plain `apt install`; do a one-time parity re-check on a real runner before trusting the
   gate in production.
5. **CI cost** — valgrind is ~20–100× slower and the differential doubles runs; keep the
   job separate and off the critical path.

## Out of scope (YAGNI)

Native addon; CodSpeed / any external service; perf dashboard or charts; gh-pages data
branch; self-hosted runner; running the runtime gate across the full Node matrix; blocking
enforcement on day one.

## Success criteria

- A PR that regresses a benchmarked hot path by ≥ 3 % produces a visible failing/ warning
  signal in CI with a per-case breakdown.
- The gate is deterministic: an unchanged PR reports ~0 % deltas run-to-run.
- `size-limit` fails a PR that exceeds a bundle budget and comments the byte delta.
- No third-party GitHub App, external account, or manually-managed secret is required.
- The repo stays pure-TypeScript (no native build).
