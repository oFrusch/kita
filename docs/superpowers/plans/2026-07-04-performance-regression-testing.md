# Performance-regression testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted, deterministic CI gate that catches runtime perf regressions (differential Callgrind instruction counting) and bundle-size regressions (size-limit), with no third-party services.

**Architecture:** A `bench/` harness measures each hot path by running it at N and 2N iterations under `valgrind --tool=callgrind` with `node --predictable`, then subtracting: `Δ = Ir(2N) − Ir(N)` cancels Node startup/JIT and isolates per-iteration instruction cost. Bench cases are authored in TypeScript (they use kita's `@reactive accessor` decorators) and AOT-bundled with esbuild to plain ESM before `node` runs them. A committed `bench/baseline.json` is the comparison basis; a new `.github/workflows/perf.yml` runs the gate (inform-first) plus a size-limit job.

**Tech Stack:** Node 22, esbuild (AOT bundling), Valgrind/Callgrind, vitest (for the pure-logic unit tests), size-limit + `andresz1/size-limit-action`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-04-performance-regression-testing-design.md`

---

## Orientation for the implementer

**Why the odd build step.** kita uses TC39 stage-3 `accessor` decorators (`@reactive() accessor x = 1`). Plain `node` (even v24) throws `SyntaxError` on that syntax. So any bench file that *contains* decorator syntax must be transpiled ahead of time. We use esbuild (already a dependency) to bundle each run into self-contained plain ESM, Vue included. This is AOT — nothing transpiles at runtime, so Callgrind's instruction counts stay deterministic.

**Why `--predictable` is mandatory.** Default V8 does background JIT/GC on other threads, which makes instruction counts swing ~90% run-to-run. `node --predictable --no-concurrent-recompilation` forces single-threaded, deterministic execution. Verified in the spike: run-to-run spread drops to ~0.0002%.

**Two kinds of files:**
- **Pure orchestration** (`.mjs`, no kita import, run directly by `node`): `parse.mjs`, `compare.mjs`, `valgrind.mjs`, `measure.mjs`, `cases.mjs`, `gate.mjs`, `update-baseline.mjs`. These we unit-test with vitest (TDD).
- **Compiled bench code** (`.ts`, imports kita, uses decorators, must be esbuild-bundled): `bench/harness/run-case.ts`, `bench/cases/index.ts`, `bench/cases/*.bench.ts`. Verified empirically by running under valgrind.

**Valgrind locally.** This dev box has no passwordless sudo. Task 4 adds `bench/harness/bootstrap-valgrind.sh` (rootless `apt-get download` + `dpkg-deb -x`) and `valgrind.mjs` auto-detects either a system valgrind or that local prefix. In CI we `apt-get install valgrind` normally.

**Tuning is validated, not guessed.** Per-case `N` (iterations) and `warmup` are starting points. Task 7 builds a sensitivity self-test; Task 8's cases are each validated to resolve an injected +3% before being trusted. If a case can't, bump its `N`/`warmup` or make its body do more work.

---

## File structure

```
bench/
  harness/
    parse.mjs             # parseIr(callgrindOutText) -> number         (pure, tested)
    compare.mjs           # compare(baseline, current, opts), formatTable(rows)  (pure, tested)
    valgrind.mjs          # findValgrind() -> { bin, env }              (pure-ish, verified)
    measure.mjs           # measureCase(name, {N, reps}) -> { name, delta, perIter }
    cases.mjs             # CASES: [{ name, N }]  gate registry (orchestration metadata)
    gate.mjs              # run all CASES, compare to baseline.json, write comment.md, exit code
    update-baseline.mjs   # run all CASES, write baseline.json (records node + valgrind versions)
    run-case.ts           # node --predictable entry; esbuild-bundled -> .dist/run-case.mjs
    bootstrap-valgrind.sh # rootless valgrind install for no-sudo dev machines
  cases/
    index.ts              # REGISTRY: { [name]: { isAsync, warmup, setup, body } }  (static imports)
    _sanity.bench.ts      # tunable arithmetic kernel for the sensitivity self-test (not in the gate)
    reactive-construct.bench.ts
    reactive-write.bench.ts
    store-bulk-push.bench.ts
    store-peek.bench.ts
    query-cache.bench.ts
    request-dedupe.bench.ts
    pagination-loadmore.bench.ts
    optimistic-success.bench.ts
  baseline.json           # committed per-case Δ + toolchain versions
  .dist/                  # esbuild output (gitignored)
  .valgrind/              # rootless valgrind prefix (gitignored)
  comment.md              # generated PR-comment body (gitignored)
tests/
  bench-parse.test.ts     # TDD for parseIr
  bench-compare.test.ts   # TDD for compare + formatTable
.github/workflows/
  perf.yml                # runtime (Callgrind) + size (size-limit) jobs
  perf-baseline.yml       # workflow_dispatch: regenerate baseline.json, open a PR
```

---

## Task 1: Scaffold — dirs, gitignore, esbuild dep, scripts

**Files:**
- Create: `bench/.gitkeep` (placeholder so the dir exists before other tasks)
- Modify: `.gitignore`
- Modify: `package.json` (devDependency + scripts)
- Modify: `tsconfig.json` (`allowJs`, so `tsc` can resolve the `.mjs` harness imports from tests)

- [ ] **Step 1: Create the bench directory**

```bash
mkdir -p bench/harness bench/cases
touch bench/.gitkeep
```

- [ ] **Step 2: Add build artifacts to `.gitignore`**

Append these lines to `.gitignore`:

```gitignore

# bench harness artifacts
bench/.dist/
bench/.valgrind/
bench/comment.md
```

- [ ] **Step 3: Add esbuild as an explicit devDependency**

esbuild is currently only a transitive dep of tsup; depending on its binary directly requires a direct entry.

Run: `pnpm add -D esbuild@^0.24.0`

Expected: `package.json` `devDependencies` gains `"esbuild": "^0.24.0"`, lockfile updates.

- [ ] **Step 4: Add scripts to `package.json`**

In the `"scripts"` block, add:

```json
    "bench:build": "esbuild bench/harness/run-case.ts --bundle --format=esm --target=es2022 --platform=node --outfile=bench/.dist/run-case.mjs",
    "bench": "pnpm bench:build && node bench/harness/gate.mjs",
    "bench:update": "pnpm bench:build && node bench/harness/update-baseline.mjs",
```

- [ ] **Step 5: Enable `allowJs` so `pnpm typecheck` can resolve the `.mjs` harness imports**

The unit tests (Tasks 2, 3, 7) import the harness modules as `.mjs`. With the current `tsconfig.json` (`allowJs: false` + strict), `tsc --noEmit` fails those imports with `TS7016 (could not find a declaration file)`, which breaks the **existing** `typecheck` CI job. Add `"allowJs": true` to `compilerOptions` in `tsconfig.json` (leave `checkJs` at its default `false`, so the JS itself is not type-checked — this only lets `tsc` resolve the imports as `any`):

```jsonc
{
  "compilerOptions": {
    // ...existing options unchanged...
    "allowJs": true
  }
}
```

(Verify once Task 2 lands: `pnpm typecheck` exits 0.)

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json pnpm-lock.yaml tsconfig.json bench/.gitkeep
git commit -m "chore | scaffold bench harness dir + esbuild dep + scripts"
```

---

## Task 2: `parseIr` — parse Callgrind instruction total (TDD)

**Files:**
- Create: `bench/harness/parse.mjs`
- Test: `tests/bench-parse.test.ts`

A Callgrind output file declares its event columns with `events: Ir …` and ends with a `summary:` line giving the totals in that column order. `Ir` (instructions retired) is always the first column, so we take the first integer after `summary:`.

- [ ] **Step 1: Write the failing test**

Create `tests/bench-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseIr } from "../bench/harness/parse.mjs";

const SAMPLE = `version: 1
creator: callgrind-3.22.0
cmd: node --predictable run-case.mjs reactive 200000
events: Ir
fn=(below main)
1234
summary: 987654321
totals: 987654321
`;

describe("parseIr", () => {
  it("reads the Ir total from the summary line", () => {
    expect(parseIr(SAMPLE)).toBe(987654321);
  });

  it("takes the first column when multiple events are present", () => {
    const multi = "events: Ir Dr Dw\nsummary: 500 40 30\n";
    expect(parseIr(multi)).toBe(500);
  });

  it("throws when there is no summary line", () => {
    expect(() => parseIr("events: Ir\n")).toThrow(/summary/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/bench-parse.test.ts`
Expected: FAIL — cannot resolve `../bench/harness/parse.mjs`.

- [ ] **Step 3: Write the implementation**

Create `bench/harness/parse.mjs`:

```js
/**
 * Parse the total instruction count (Ir) from a Callgrind output file.
 *
 * Callgrind declares its event columns with `events: Ir ...` and writes a
 * `summary: <n> ...` totals line in that column order. Ir is always first, so
 * we return the first integer after `summary:`.
 */
export function parseIr(callgrindOut) {
  const line = callgrindOut
    .split("\n")
    .find((l) => l.startsWith("summary:"));
  if (!line) {
    throw new Error("no `summary:` line in callgrind output");
  }
  const first = line.slice("summary:".length).trim().split(/\s+/)[0];
  const ir = Number(first);
  if (!Number.isFinite(ir)) {
    throw new Error(`could not parse Ir from summary line: "${line}"`);
  }
  return ir;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/bench-parse.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add bench/harness/parse.mjs tests/bench-parse.test.ts
git commit -m "feat | bench: parse Ir total from callgrind output"
```

---

## Task 3: `compare` + `formatTable` — verdict and PR table (TDD)

**Files:**
- Create: `bench/harness/compare.mjs`
- Test: `tests/bench-compare.test.ts`

`compare` takes the committed baseline (a `{ name: delta }` map) and the current measurements (`[{ name, delta }]`), returns per-case rows with a percent change and a `status` (`ok`/`warn`/`fail`/`new`) plus an overall `verdict`. `formatTable` renders rows as a Markdown table for the PR comment.

- [ ] **Step 1: Write the failing test**

Create `tests/bench-compare.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compare, formatTable } from "../bench/harness/compare.mjs";

const baseline = { alpha: 1000, beta: 2000 };

describe("compare", () => {
  it("flags a case over the fail threshold", () => {
    const { rows, verdict } = compare(
      baseline,
      [{ name: "alpha", delta: 1035 }], // +3.5%
      { warnPct: 1, failPct: 3 },
    );
    expect(rows[0].status).toBe("fail");
    expect(rows[0].pct).toBeCloseTo(3.5, 5);
    expect(verdict).toBe("fail");
  });

  it("warns between warn and fail thresholds", () => {
    const { verdict } = compare(baseline, [{ name: "beta", delta: 2040 }], {
      warnPct: 1,
      failPct: 3,
    }); // +2%
    expect(verdict).toBe("warn");
  });

  it("passes within the warn threshold", () => {
    const { verdict } = compare(baseline, [{ name: "alpha", delta: 1005 }], {
      warnPct: 1,
      failPct: 3,
    }); // +0.5%
    expect(verdict).toBe("ok");
  });

  it("marks unknown cases as new (never fails on them)", () => {
    const { rows, verdict } = compare(baseline, [{ name: "gamma", delta: 500 }]);
    expect(rows[0].status).toBe("new");
    expect(rows[0].pct).toBeNull();
    expect(verdict).toBe("ok");
  });
});

describe("formatTable", () => {
  it("renders a markdown table with a header row", () => {
    const { rows } = compare(baseline, [{ name: "alpha", delta: 1035 }]);
    const table = formatTable(rows);
    expect(table).toContain("| case |");
    expect(table).toContain("alpha");
    expect(table).toContain("%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/bench-compare.test.ts`
Expected: FAIL — cannot resolve `../bench/harness/compare.mjs`.

- [ ] **Step 3: Write the implementation**

Create `bench/harness/compare.mjs`:

```js
/**
 * Compare current per-case instruction deltas against a committed baseline.
 *
 * @param baseline  map of { caseName: baselineDelta }
 * @param current   array of { name, delta } freshly measured
 * @param opts      { warnPct, failPct } percentage thresholds
 * @returns { rows, verdict } — verdict is "fail" | "warn" | "ok"
 */
export function compare(baseline, current, { warnPct = 1, failPct = 3 } = {}) {
  const rows = current.map((cur) => {
    const base = baseline[cur.name];
    if (base == null) {
      return { name: cur.name, delta: cur.delta, base: null, pct: null, status: "new" };
    }
    const pct = ((cur.delta - base) / base) * 100;
    const status = pct >= failPct ? "fail" : pct >= warnPct ? "warn" : "ok";
    return { name: cur.name, delta: cur.delta, base, pct, status };
  });

  const verdict = rows.some((r) => r.status === "fail")
    ? "fail"
    : rows.some((r) => r.status === "warn")
      ? "warn"
      : "ok";

  return { rows, verdict };
}

const ICON = { ok: "✅", warn: "⚠️", fail: "❌", new: "🆕" };

/** Render comparison rows as a Markdown table for the PR comment / console. */
export function formatTable(rows) {
  const header =
    "| case | Δ instructions | baseline | change | status |\n|---|--:|--:|--:|---|";
  const body = rows
    .map((r) => {
      const pct =
        r.pct == null ? "—" : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`;
      const base = r.base == null ? "—" : r.base.toLocaleString("en-US");
      return `| ${r.name} | ${r.delta.toLocaleString("en-US")} | ${base} | ${pct} | ${ICON[r.status]} ${r.status} |`;
    })
    .join("\n");
  return `${header}\n${body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/bench-compare.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add bench/harness/compare.mjs tests/bench-compare.test.ts
git commit -m "feat | bench: compare deltas to baseline + render PR table"
```

---

## Task 4: Locate valgrind (`valgrind.mjs`) + rootless bootstrap

**Files:**
- Create: `bench/harness/valgrind.mjs`
- Create: `bench/harness/bootstrap-valgrind.sh`

`findValgrind()` prefers a system valgrind on `PATH`; if absent, it falls back to a rootless prefix at `bench/.valgrind/` (populated by the bootstrap script), returning the `VALGRIND_LIB` env it needs.

- [ ] **Step 1: Write `valgrind.mjs`**

Create `bench/harness/valgrind.mjs`:

```js
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Locate a usable valgrind. Prefers a system install on PATH; falls back to the
 * rootless prefix under bench/.valgrind/ created by bootstrap-valgrind.sh.
 * @returns { bin, env } — env carries VALGRIND_LIB when using the local prefix.
 */
export function findValgrind() {
  // 1. system valgrind
  try {
    execFileSync("valgrind", ["--version"], { stdio: "ignore" });
    return { bin: "valgrind", env: {} };
  } catch {
    // not on PATH — try the local rootless prefix
  }

  // 2. rootless prefix (bench/.valgrind, populated by bootstrap-valgrind.sh)
  const prefix = fileURLToPath(new URL("../.valgrind/", import.meta.url));
  const bin = `${prefix}usr/bin/valgrind`;
  if (existsSync(bin)) {
    // Debian/Ubuntu ship the tool libdir at usr/libexec/valgrind (valgrind >=3.19)
    // or usr/lib/valgrind (older). Pick whichever exists.
    const libexec = `${prefix}usr/libexec/valgrind`;
    const lib = `${prefix}usr/lib/valgrind`;
    return { bin, env: { VALGRIND_LIB: existsSync(libexec) ? libexec : lib } };
  }

  throw new Error(
    "valgrind not found. Install it (sudo apt-get install -y valgrind) or, on a " +
      "machine without sudo, run: bash bench/harness/bootstrap-valgrind.sh",
  );
}
```

- [ ] **Step 2: Write `bootstrap-valgrind.sh`**

Create `bench/harness/bootstrap-valgrind.sh`:

```bash
#!/usr/bin/env bash
# Install a rootless copy of valgrind into bench/.valgrind for machines without
# passwordless sudo. Uses apt-get download (no root) + dpkg-deb extraction.
set -euo pipefail

DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.valgrind"
mkdir -p "$DEST"
cd "$DEST"

echo "Downloading valgrind .deb (no root)..."
apt-get download valgrind
dpkg-deb -x valgrind_*.deb .
rm -f valgrind_*.deb

echo "Verifying..."
LIB="$DEST/usr/libexec/valgrind"; [ -d "$LIB" ] || LIB="$DEST/usr/lib/valgrind"
VALGRIND_LIB="$LIB" "$DEST/usr/bin/valgrind" --version
echo "valgrind ready at $DEST/usr/bin/valgrind (VALGRIND_LIB=$LIB)"
```

- [ ] **Step 3: Make it executable and verify valgrind resolves**

```bash
chmod +x bench/harness/bootstrap-valgrind.sh
# On this no-sudo dev box, populate the local prefix:
bash bench/harness/bootstrap-valgrind.sh
# Confirm findValgrind() locates it:
node -e "import('./bench/harness/valgrind.mjs').then(m => console.log(m.findValgrind()))"
```

Expected: bootstrap prints a `valgrind-3.xx` version; the `node -e` line prints an object with a `bin` path ending `usr/bin/valgrind` and an `env.VALGRIND_LIB`.

- [ ] **Step 4: Commit**

```bash
git add bench/harness/valgrind.mjs bench/harness/bootstrap-valgrind.sh
git commit -m "chore | bench: locate valgrind (system or rootless prefix)"
```

---

## Task 5: The runner (`run-case.ts`) + registry + sanity case + esbuild build

**Files:**
- Create: `bench/harness/run-case.ts`
- Create: `bench/cases/index.ts`
- Create: `bench/cases/_sanity.bench.ts`

The runner is invoked as `node --predictable --no-concurrent-recompilation bench/.dist/run-case.mjs <caseName> <iterations>`. It looks the case up in a static registry, calls `setup()` once, warms up so the body JITs (a fixed cost that cancels in the differential), then runs the measured loop. A `sink` written to stdout defeats dead-code elimination. Async cases (`isAsync: true`) are awaited.

- [ ] **Step 1: Write the sanity case**

Create `bench/cases/_sanity.bench.ts`:

```ts
// A branch-free, allocation-free arithmetic kernel used ONLY to validate the
// harness (determinism + sensitivity). Not part of the gate. BENCH_WEIGHT (env)
// scales the inner work so the self-test can inject a known % regression.
const WEIGHT = Number(process.env.BENCH_WEIGHT ?? "100");

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  return { x: 123456789 };
}

export function body(state: { x: number }): number {
  let x = state.x;
  for (let w = 0; w < WEIGHT; w++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x = Math.imul(x, 2654435761);
  }
  state.x = x;
  return x;
}
```

- [ ] **Step 2: Write the registry**

Create `bench/cases/index.ts` (only `_sanity` for now; later tasks add the rest):

```ts
import * as sanity from "./_sanity.bench";

export interface BenchCase {
  isAsync?: boolean;
  warmup?: number;
  setup: () => unknown;
  body: (state: never) => unknown;
}

export const REGISTRY: Record<string, BenchCase> = {
  _sanity: sanity as unknown as BenchCase,
};
```

- [ ] **Step 3: Write the runner**

Create `bench/harness/run-case.ts`:

```ts
import { REGISTRY } from "../cases/index";

const [, , caseName, iterationsArg] = process.argv;
const iterations = Number(iterationsArg);

const mod = REGISTRY[caseName];
if (!mod) {
  console.error(`unknown bench case: ${caseName}`);
  process.exit(2);
}

const warmup = mod.warmup ?? 3000;
const state = mod.setup() as never;
const body = mod.body;

let sink = 0;

if (mod.isAsync) {
  for (let i = 0; i < warmup; i++) sink += (await body(state) as number) | 0;
  for (let i = 0; i < iterations; i++) sink += (await body(state) as number) | 0;
} else {
  for (let i = 0; i < warmup; i++) sink += (body(state) as number) | 0;
  for (let i = 0; i < iterations; i++) sink += (body(state) as number) | 0;
}

// Observe the sink so V8 cannot dead-code-eliminate the measured loop.
if (sink === Math.PI) console.log(sink);
```

- [ ] **Step 4: Build the bundle and run it (no valgrind yet)**

```bash
pnpm bench:build
node --predictable --no-concurrent-recompilation bench/.dist/run-case.mjs _sanity 1000
echo "exit: $?"
```

Expected: `pnpm bench:build` writes `bench/.dist/run-case.mjs` with no errors; the `node` run exits 0 with no output (the `Math.PI` guard never prints). This proves the decorator-free sanity case bundles and runs under `--predictable`.

- [ ] **Step 5: Commit**

```bash
git add bench/harness/run-case.ts bench/cases/index.ts bench/cases/_sanity.bench.ts
git commit -m "feat | bench: case runner + registry + sanity kernel"
```

---

## Task 6: `measure.mjs` — differential measurement under valgrind

**Files:**
- Create: `bench/harness/measure.mjs`

`measureCase` runs the bundled runner at N and 2N under Callgrind, parses each Ir total, and returns `Δ = Ir(2N) − Ir(N)`. It repeats `reps` times and keeps the minimum delta (least noise). It counts the whole process (no bracketing); the subtraction cancels the fixed Node/JIT pedestal.

- [ ] **Step 1: Write `measure.mjs`**

Create `bench/harness/measure.mjs`:

```js
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findValgrind } from "./valgrind.mjs";
import { parseIr } from "./parse.mjs";

const RUNNER = fileURLToPath(new URL("../.dist/run-case.mjs", import.meta.url));
const NODE_FLAGS = ["--predictable", "--no-concurrent-recompilation"];

// Run the bundled case runner once under Callgrind at `iters` iterations;
// return the whole-process Ir total.
function irAt(caseName, iters, vg) {
  const dir = mkdtempSync(join(tmpdir(), "kita-bench-"));
  const out = join(dir, "callgrind.out");
  try {
    execFileSync(
      vg.bin,
      [
        "-q",
        "--tool=callgrind",
        `--callgrind-out-file=${out}`,
        process.execPath,
        ...NODE_FLAGS,
        RUNNER,
        caseName,
        String(iters),
      ],
      { stdio: "ignore", env: { ...process.env, ...vg.env } },
    );
    return parseIr(readFileSync(out, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Differential measurement: Δ = Ir(2N) − Ir(N). The fixed Node startup + JIT
 * warm-up cancels, leaving the instruction cost of N iterations of the hot body.
 * Repeated `reps` times; the minimum delta is kept (least noise).
 */
export function measureCase(caseName, { N = 200_000, reps = 2 } = {}) {
  const vg = findValgrind();
  let best = Infinity;
  for (let r = 0; r < reps; r++) {
    const delta = irAt(caseName, 2 * N, vg) - irAt(caseName, N, vg);
    if (delta < best) best = delta;
  }
  return { name: caseName, N, delta: best, perIter: best / N };
}
```

- [ ] **Step 2: Verify a stable, positive delta for the sanity case**

```bash
pnpm bench:build
node -e "import('./bench/harness/measure.mjs').then(async m => { \
  console.log(m.measureCase('_sanity', { N: 50000, reps: 3 })); \
})"
```

Expected: an object like `{ name: '_sanity', N: 50000, delta: <a large positive integer>, perIter: <~hundreds> }`. Run it twice — `delta` should match to within a fraction of a percent (determinism check). If `delta` is negative or wildly variable, `--predictable` is not taking effect — stop and investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git add bench/harness/measure.mjs
git commit -m "feat | bench: differential callgrind measurement (Ir(2N)-Ir(N))"
```

---

## Task 7: Sensitivity self-test — prove the harness resolves a known regression

**Files:**
- Create: `tests/bench-sensitivity.test.ts`

This is not a pure unit test — it drives the real valgrind path — so it is gated behind an env flag and excluded from the normal `pnpm test` run (valgrind isn't always present). It injects a +3% workload via `BENCH_WEIGHT` and asserts the measured delta rises ~3%, proving the harness can detect a micro-regression.

- [ ] **Step 1: Write the self-test**

Create `tests/bench-sensitivity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { measureCase } from "../bench/harness/measure.mjs";

// Opt-in: only runs when RUN_BENCH_SENSITIVITY=1 and valgrind is available.
const run = process.env.RUN_BENCH_SENSITIVITY === "1";

describe.runIf(run)("bench harness sensitivity", () => {
  it("resolves an injected +3% regression on the sanity kernel", () => {
    process.env.BENCH_WEIGHT = "100";
    const base = measureCase("_sanity", { N: 50_000, reps: 2 }).delta;

    process.env.BENCH_WEIGHT = "103"; // +3% inner work
    const heavier = measureCase("_sanity", { N: 50_000, reps: 2 }).delta;

    const pct = ((heavier - base) / base) * 100;
    // Expect ~3%; allow a generous band well clear of the ~0% noise floor.
    expect(pct).toBeGreaterThan(2);
    expect(pct).toBeLessThan(4);
  }, 120_000);
});
```

- [ ] **Step 2: Run the self-test (requires valgrind + the built bundle)**

```bash
pnpm bench:build
RUN_BENCH_SENSITIVITY=1 pnpm exec vitest run tests/bench-sensitivity.test.ts
```

Expected: PASS — the measured change lands between 2% and 4%. If it lands near 0% or is unstable, the sanity kernel isn't dominating the loop overhead; increase `WEIGHT` in `_sanity.bench.ts` and retry.

- [ ] **Step 3: Exclude the sensitivity test from the default test run**

Modify `vitest.config.ts` so `pnpm test` (which has no valgrind guarantee) skips it:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/bench-sensitivity.test.ts", "**/node_modules/**"],
    globals: false,
  },
});
```

Run: `pnpm test`
Expected: PASS, and the sensitivity test is not among the run files.

- [ ] **Step 4: Commit**

```bash
git add tests/bench-sensitivity.test.ts vitest.config.ts
git commit -m "test | bench: sensitivity self-test (opt-in, valgrind-gated)"
```

---

## Task 8: The gate benchmark cases

Each case is a `.ts` module exporting `isAsync`, `warmup`, `setup`, `body`. API usage and warmup-safety are taken from the existing tests/source. **`N`/`warmup` are starting points** — after wiring the gate (Task 9), re-run the sensitivity approach on any case that looks off. The registry (`bench/cases/index.ts`) is updated once at the end.

**Files (create all):**
- `bench/cases/reactive-construct.bench.ts`
- `bench/cases/reactive-write.bench.ts`
- `bench/cases/store-bulk-push.bench.ts`
- `bench/cases/store-peek.bench.ts`
- `bench/cases/query-cache.bench.ts`
- `bench/cases/request-dedupe.bench.ts`
- `bench/cases/pagination-loadmore.bench.ts`
- `bench/cases/optimistic-success.bench.ts`
- `bench/cases/optimistic-rollback.bench.ts`
- Modify: `bench/cases/index.ts`

- [ ] **Step 1: reactive — construct**

Create `bench/cases/reactive-construct.bench.ts`:

```ts
import reactive from "../../src/decorators/reactive";

class ReactiveModel {
  @reactive() accessor a = 1;
  @reactive() accessor b = "hello";
  @reactive() accessor c: string[] = [];
}

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  return {};
}

// Fresh instance per call: 1 object + 3 vue refs + 3 per-field WeakMap entries.
// No PERSISTENT structure grows (the WeakMaps are instance-keyed), but the
// discarded instances are floating garbage that V8 reclaims lazily under
// --predictable-gc-schedule — so an iteration-count-dependent GC term rides
// along in the instruction count. This case MUST pass the sensitivity check in
// Task 9 Step 5 (stable Δ + resolves +3% at its N) before it is trusted; if the
// GC term dominates, lower its N in cases.mjs, or drop it (reactive-write
// already covers the reactive get/set hot path cleanly). Return a scalar (DCE).
export function body(): number {
  const m = new ReactiveModel();
  return m.a | 0;
}
```

- [ ] **Step 2: reactive — write**

Create `bench/cases/reactive-write.bench.ts`:

```ts
import reactive from "../../src/decorators/reactive";

class ReactiveModel {
  @reactive() accessor a = 1;
  @reactive() accessor b = "hello";
  @reactive() accessor c: string[] = [];
}

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  return { inst: new ReactiveModel(), n: 0 };
}

// Setter path: WeakMap.get(this) + assign ref.value in place. Bounded 32-bit
// counter so nothing grows. Warmup-safe on the shared instance.
export function body(state: { inst: ReactiveModel; n: number }): number {
  state.n = (state.n + 1) | 0;
  state.inst.a = state.n;
  return state.inst.a | 0;
}
```

- [ ] **Step 3: store — bulk push**

Create `bench/cases/store-bulk-push.bench.ts`:

```ts
import { AsyncStore } from "../../src/stores";
import { AsyncModel } from "../../src/models";
import type { HttpClient } from "../../src/http";

// Real HttpClient shape, but a PLAIN object (not vi.fn) — the push path never
// calls it; it only satisfies the constructor.
const client: HttpClient = {
  get: async () => ({ data: {} }),
  post: async () => ({ data: {} }),
  put: async () => ({ data: {} }),
  delete: async () => ({ data: {} }),
};

class UserModel extends AsyncModel {
  static readonly id = "users";
  declare email: string;
}
class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";
}

const BULK = 1000;

export const isAsync = false;
export const warmup = 50;

export function setup() {
  // Pre-build BULK models with UNIQUE ids via `new` (NOT create(), which would
  // auto-push into the registry singleton). All-unique ids => every push hits
  // the INSERT branch, never the merge branch.
  const records = Array.from(
    { length: BULK },
    (_, i) => new UserModel({ id: String(i), email: `u${i}@x.com` }),
  );
  return { records };
}

// Fresh store per call, discarded each iteration => its Map/array never carry
// over (self-contained, linear). Measures the full normalization/push path.
export function body(state: { records: UserModel[] }): number {
  const store = new UserStore(client, {});
  const recs = state.records;
  for (let i = 0; i < recs.length; i++) store._pushRecord(recs[i]);
  return store.records.length;
}
```

- [ ] **Step 4: store — peek**

Create `bench/cases/store-peek.bench.ts`:

```ts
import { AsyncStore } from "../../src/stores";
import { AsyncModel } from "../../src/models";
import type { HttpClient } from "../../src/http";

const client: HttpClient = {
  get: async () => ({ data: {} }),
  post: async () => ({ data: {} }),
  put: async () => ({ data: {} }),
  delete: async () => ({ data: {} }),
};

class UserModel extends AsyncModel {
  static readonly id = "users";
  declare email: string;
}
class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";
}

const SIZE = 1000;

export const isAsync = false;
export const warmup = 200;

export function setup() {
  const store = new UserStore(client, {});
  const ids: string[] = [];
  for (let i = 0; i < SIZE; i++) {
    const m = new UserModel({ id: String(i), email: `u${i}@x.com` });
    store._pushRecord(m);
    ids.push(m.id);
  }
  return { store, ids };
}

// Read-only Map lookups against a store populated once — no mutation, perfectly
// linear. Loop all ids so the body does real work; return the last hit's id.
export function body(state: { store: UserStore; ids: string[] }): number {
  let hit: UserModel | undefined;
  const { store, ids } = state;
  for (let i = 0; i < ids.length; i++) hit = store.peekRecord(ids[i]);
  return hit ? Number(hit.id) : 0;
}
```

- [ ] **Step 5: query cache — set+get roundtrip**

Create `bench/cases/query-cache.bench.ts`:

```ts
import { QueryCache } from "../../src/utils/query-cache";

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  const cache = new QueryCache<string>();
  // Multi-key, deliberately unsorted so makeKey's Object.keys().sort() does work.
  const params = { page: 1, filter: "active", sort: "name", limit: 50 };
  const data = ["item1", "item2", "item3"];
  cache.set(params, data);
  return { cache, params, data };
}

// set + get with the same key: overwrites (cache size stays 1), exercising the
// sorted-key JSON serialization twice + the Date.now() TTL check. Bounded.
export function body(state: {
  cache: QueryCache<string>;
  params: Record<string, unknown>;
  data: string[];
}): number {
  state.cache.set(state.params, state.data);
  const got = state.cache.get(state.params);
  return got ? got.length : 0;
}
```

- [ ] **Step 6: request tracker — dedupe**

Create `bench/cases/request-dedupe.bench.ts`:

```ts
import { RequestTracker } from "../../src/utils/request-tracker";

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  const tracker = new RequestTracker();
  const key = "resource:list:page-1";
  const resolved = () => Promise.resolve("payload");
  return { tracker, key, resolved };
}

// Same key each call: the first call registers a pending promise, subsequent
// calls hit the dedup branch and return it — the pending Map stays capped at 1.
// We create the promise (a real side effect) but don't await; DCE-safe because
// dedupe mutates the Map.
export function body(state: {
  tracker: RequestTracker;
  key: string;
  resolved: () => Promise<string>;
}): number {
  const p = state.tracker.dedupe(state.key, state.resolved);
  return p ? 1 : 0;
}
```

- [ ] **Step 7: pagination — loadMore (async)**

Create `bench/cases/pagination-loadmore.bench.ts`:

```ts
import { PaginatedQuery } from "../../src/utils";
import type { PaginatedResult } from "../../src/utils";

const PAGE_SIZE = 20;

export const isAsync = true;
export const warmup = 2000;

export function setup() {
  // In-memory fetcher, always hasMore:true so loadMore never short-circuits.
  const fetcher = (page: number): Promise<PaginatedResult<string>> =>
    Promise.resolve({
      records: Array.from(
        { length: PAGE_SIZE },
        (_, i) => `item-${(page - 1) * PAGE_SIZE + i + 1}`,
      ),
      meta: {
        page,
        totalPages: 1_000_000,
        totalCount: PAGE_SIZE * 1_000_000,
        hasMore: true,
      },
    });
  return { query: new PaginatedQuery<string>(fetcher) };
}

// Full loadMore path; MUST be awaited (isLoading guard would short-circuit an
// un-awaited concurrent call). Only _currentPage (an int) grows — no record
// accumulation inside the query.
export async function body(state: {
  query: PaginatedQuery<string>;
}): Promise<number> {
  const records = await state.query.loadMore();
  return records.length;
}
```

- [ ] **Step 8: optimistic — success (async)**

Create `bench/cases/optimistic-success.bench.ts`:

```ts
import { withOptimisticUpdate } from "../../src/utils";

export const isAsync = true;
export const warmup = 2000;

export function setup() {
  const record = { id: "1", name: "original", version: 1 };
  const okServer = () => Promise.resolve({ id: "1", name: "confirmed", version: 2 });
  return { record, okServer };
}

// Happy path: snapshot + optimistic mutate -> await server -> return result.
// One small snapshot allocated per call (GC'd); single field reassigned on the
// shared record — constant memory.
export async function body(state: {
  record: { id: string; name: string; version: number };
  okServer: () => Promise<{ id: string; name: string; version: number }>;
}): Promise<number> {
  const { record, okServer } = state;
  const result = await withOptimisticUpdate(
    () => {
      const snap = { ...record };
      record.name = "optimistic";
      return snap;
    },
    okServer,
    (snap) => {
      record.name = snap.name;
    },
  );
  return result.version;
}
```

- [ ] **Step 9: optimistic — rollback (async)**

Create `bench/cases/optimistic-rollback.bench.ts`:

```ts
import { withOptimisticUpdate } from "../../src/utils";

export const isAsync = true;
export const warmup = 2000;

export function setup() {
  const record = { id: "1", name: "original", version: 1 };
  const failServer = () => Promise.reject(new Error("network"));
  return { record, failServer };
}

// Error path: optimistic mutate -> server rejects -> withOptimisticUpdate rolls
// back (restores record.name) and rethrows -> we catch. The shared record
// self-heals to "original" each iteration, so it stays linear.
export async function body(state: {
  record: { id: string; name: string; version: number };
  failServer: () => Promise<never>;
}): Promise<number> {
  const { record, failServer } = state;
  try {
    await withOptimisticUpdate(
      () => {
        const snap = { ...record };
        record.name = "optimistic";
        return snap;
      },
      failServer,
      (snap) => {
        record.name = snap.name;
      },
    );
    return 0;
  } catch {
    return record.name.length; // rollback restored "original"
  }
}
```

- [ ] **Step 10: Register all cases**

Replace `bench/cases/index.ts` with:

```ts
import * as sanity from "./_sanity.bench";
import * as reactiveConstruct from "./reactive-construct.bench";
import * as reactiveWrite from "./reactive-write.bench";
import * as storeBulkPush from "./store-bulk-push.bench";
import * as storePeek from "./store-peek.bench";
import * as queryCache from "./query-cache.bench";
import * as requestDedupe from "./request-dedupe.bench";
import * as paginationLoadMore from "./pagination-loadmore.bench";
import * as optimisticSuccess from "./optimistic-success.bench";
import * as optimisticRollback from "./optimistic-rollback.bench";

export interface BenchCase {
  isAsync?: boolean;
  warmup?: number;
  setup: () => unknown;
  body: (state: never) => unknown;
}

export const REGISTRY: Record<string, BenchCase> = {
  _sanity: sanity as unknown as BenchCase,
  "reactive-construct": reactiveConstruct as unknown as BenchCase,
  "reactive-write": reactiveWrite as unknown as BenchCase,
  "store-bulk-push": storeBulkPush as unknown as BenchCase,
  "store-peek": storePeek as unknown as BenchCase,
  "query-cache": queryCache as unknown as BenchCase,
  "request-dedupe": requestDedupe as unknown as BenchCase,
  "pagination-loadmore": paginationLoadMore as unknown as BenchCase,
  "optimistic-success": optimisticSuccess as unknown as BenchCase,
  "optimistic-rollback": optimisticRollback as unknown as BenchCase,
};
```

- [ ] **Step 11: Build and smoke-test each case runs under `--predictable`**

```bash
pnpm bench:build
for c in reactive-construct reactive-write store-bulk-push store-peek query-cache request-dedupe pagination-loadmore optimistic-success optimistic-rollback; do
  echo "== $c =="
  node --predictable --no-concurrent-recompilation bench/.dist/run-case.mjs "$c" 2000
  echo "exit: $?"
done
```

Expected: every case exits 0 with no thrown error. (No valgrind needed here — this just proves each case bundles and executes.)

- [ ] **Step 12: Commit**

```bash
git add bench/cases/
git commit -m "feat | bench: gate cases (reactive, store, cache, pagination, optimistic)"
```

---

## Task 9: Gate registry, gate runner, baseline generation

**Files:**
- Create: `bench/harness/cases.mjs`
- Create: `bench/harness/gate.mjs`
- Create: `bench/harness/update-baseline.mjs`
- Create: `bench/baseline.json` (generated)

- [ ] **Step 1: Write the gate registry (orchestration metadata)**

Create `bench/harness/cases.mjs`. `N` values are starting points (validated in Step 5); names must match `bench/cases/index.ts` keys.

```js
// Gate case list with per-case iteration counts (N). Names must match the keys
// in bench/cases/index.ts. `_sanity` is intentionally excluded (harness-only).
export const CASES = [
  { name: "reactive-construct", N: 100_000 },
  { name: "reactive-write", N: 200_000 },
  { name: "store-bulk-push", N: 40 },
  { name: "store-peek", N: 1_000 },
  { name: "query-cache", N: 100_000 },
  { name: "request-dedupe", N: 100_000 },
  { name: "pagination-loadmore", N: 20_000 },
  { name: "optimistic-success", N: 20_000 },
  { name: "optimistic-rollback", N: 20_000 },
];
```

- [ ] **Step 2: Write the gate runner**

Create `bench/harness/gate.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases.mjs";
import { measureCase } from "./measure.mjs";
import { compare, formatTable } from "./compare.mjs";

const BASELINE = fileURLToPath(new URL("../baseline.json", import.meta.url));
const COMMENT = fileURLToPath(new URL("../comment.md", import.meta.url));
const REPS = Number(process.env.BENCH_REPS ?? "2");

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const current = CASES.map((c) => measureCase(c.name, { N: c.N, reps: REPS }));
const { rows, verdict } = compare(baseline.cases, current, {
  warnPct: 1,
  failPct: 3,
});

const table = formatTable(rows);
const md = `### ⏱ Runtime perf gate — **${verdict.toUpperCase()}**\n\n${table}\n\n<sub>Δ = instructions for N iterations of each hot path (Callgrind, \`node --predictable\`). Compared against \`bench/baseline.json\`.</sub>\n`;

console.log(md);
writeFileSync(COMMENT, md);
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
}

process.exitCode = verdict === "fail" ? 1 : 0;
```

- [ ] **Step 3: Write the baseline generator**

Create `bench/harness/update-baseline.mjs`:

```js
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases.mjs";
import { measureCase } from "./measure.mjs";
import { findValgrind } from "./valgrind.mjs";

const BASELINE = fileURLToPath(new URL("../baseline.json", import.meta.url));
const REPS = Number(process.env.BENCH_REPS ?? "3");

const cases = {};
for (const c of CASES) {
  const { delta } = measureCase(c.name, { N: c.N, reps: REPS });
  cases[c.name] = delta;
  console.log(`${c.name}: ${delta.toLocaleString("en-US")}`);
}

// Record the toolchain so drift (a node/valgrind bump) is visible in the diff.
const vg = findValgrind();
const valgrind = execFileSync(vg.bin, ["--version"], {
  env: { ...process.env, ...vg.env },
})
  .toString()
  .trim();

const baseline = { node: process.version, valgrind, cases };
writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`\nwrote ${BASELINE}`);
```

- [ ] **Step 4: Generate the initial baseline**

```bash
pnpm bench:update
```

Expected: prints each case's delta, then writes `bench/baseline.json` containing `node`, `valgrind`, and a `cases` map with a positive integer per case. Inspect it — every delta should be positive and non-trivial (thousands+). A near-zero or negative delta means that case's body is being optimized away or is mis-shaped; fix the case before continuing.

> **This locally-generated baseline is PROVISIONAL.** Instruction counts are only stable for a fixed (node, valgrind) pair, and this box (Node 24 / valgrind 3.26) differs from the CI gate (Node 22 / distro valgrind). Committing it now lets you validate the harness end-to-end (Steps 5–7), but **before the gate is trusted, the committed `bench/baseline.json` must be regenerated on the CI toolchain** — run the `perf-baseline` workflow (Task 12) once it exists, or a Node 22 + distro-valgrind environment, and commit *that* file. See the Post-implementation "Parity re-check" step.

- [ ] **Step 5: Validate each real case resolves a regression (adapt the self-test)**

For each case, sanity-check sensitivity by temporarily editing its body to do ~3% more work and re-running `measureCase` for just that case (same pattern as `tests/bench-sensitivity.test.ts`): the delta should rise ~3% and be stable across repeated runs. Revert the edit. Cases that can't resolve ~3% (delta unstable or the change lands near 0%) need a larger `N` or a heavier body — adjust `bench/harness/cases.mjs` / the case and regenerate the baseline.

**Validate these three most carefully** (the verification flagged them as the likeliest to misbehave):
- **`reactive-construct`** — the fresh-`@reactive`-instance-per-call pattern accumulates floating GC garbage, injecting an iteration-count-dependent GC term. If its delta is unstable or can't resolve +3%, lower its `N` (fewer major GCs land in the window) or **drop it** — `reactive-write` already covers the reactive get/set path cleanly.
- **`pagination-loadmore` / `optimistic-*`** — the three async cases await a microtask each iteration; if microtask scheduling under `--predictable` proves noisy, lower their `N` or drop the noisiest. They are the highest-variance cases by construction.

(No code is committed from this step beyond `N` tuning or dropping a case.)

- [ ] **Step 6: Verify the gate passes against its own baseline**

```bash
pnpm bench
echo "exit: $?"
```

Expected: prints the table with every row `✅ ok` (comparing the baseline against a fresh measurement of the same code) and exits 0. Small non-zero percentages are fine as long as they're under 1%.

- [ ] **Step 7: Commit**

```bash
git add bench/harness/cases.mjs bench/harness/gate.mjs bench/harness/update-baseline.mjs bench/baseline.json
git commit -m "feat | bench: gate runner + baseline generation + committed baseline"
```

---

## Task 10: Bundle-size gate — arm `.size-limit.js`

**Files:**
- Modify: `.size-limit.js`

The config exists but has no `limit` fields, so it only reports. Add a `limit` per entry (current measured size + a small headroom) to make it fail on a bundle-size regression. `size-limit-action` in CI also compares against the base branch, but the hard `limit` is the backstop.

- [ ] **Step 1: Measure the current sizes**

```bash
pnpm build && pnpm size
```

Expected: prints two entries ("ESM — full public surface", "ESM — quick-start import") with a size each (e.g. `4.2 KB`). Note both numbers.

- [ ] **Step 2: Add `limit` fields with headroom**

This is an **in-place edit**: keep the existing file (including the `const ignore = ["vue", "@vue/devtools-api"];` header and the doc comment) and add exactly one `limit:` line to each of the two entries. Set each `limit` to the measured size from Step 1 rounded up with ~5–10% headroom. For the "full public surface" entry:

```js
  {
    name: "ESM — full public surface",
    path: "dist/index.js",
    import: "*",
    ignore,
    limit: "5 KB", // <- add this line; substitute (measured size + ~10%)
  },
```

and the same for the "quick-start import" entry (e.g. `limit: "4 KB"`). Do not replace the whole file — that would drop the `ignore` declaration the entries reference (`ReferenceError` at load).

- [ ] **Step 3: Verify the gate passes**

```bash
pnpm size
echo "exit: $?"
```

Expected: both entries show green (under limit), exit 0. If either is over, the headroom was too tight — raise that `limit`.

- [ ] **Step 4: Commit**

```bash
git add .size-limit.js
git commit -m "perf | size-limit: add budgets so bundle growth fails the gate"
```

---

## Task 11: CI workflow — `perf.yml` (runtime + size)

**Files:**
- Create: `.github/workflows/perf.yml`

Runtime gate runs on a single pinned Node (22) with distro valgrind. `continue-on-error: true` keeps it **inform-first** (surfaces regressions via a PR comment without blocking); to enforce later, drop that line and add the job to branch protection's required checks.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/perf.yml`:

```yaml
name: perf

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  runtime:
    name: Runtime perf (Callgrind)
    runs-on: ubuntu-24.04 # pinned: valgrind version must stay fixed (ubuntu-latest drifts)

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Install valgrind
        run: sudo apt-get update && sudo apt-get install -y valgrind

      - name: Run perf gate
        id: gate
        # inform-first: surface regressions without blocking. To enforce, remove
        # continue-on-error and add this job to required status checks.
        continue-on-error: true
        run: pnpm bench

      - name: Comment results on PR
        # Guard on the file existing: if the gate step CRASHES (e.g. a valgrind
        # SIGILL), comment.md is never written; without this guard the comment
        # step would fail with ENOENT and turn the inform-first job red.
        if: github.event_name == 'pull_request' && hashFiles('bench/comment.md') != ''
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: perf-runtime
          path: bench/comment.md

  size:
    name: Bundle size
    runs-on: ubuntu-24.04 # pinned: valgrind version must stay fixed (ubuntu-latest drifts)
    # size-limit-action is PR-oriented (reads the base branch for the delta + comment); skip on push.
    if: github.event_name == 'pull_request'

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # size-limit-action needs the base branch for comparison

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Check bundle size
        uses: andresz1/size-limit-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          package_manager: pnpm
          build_script: build
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/perf.yml','utf8'); if(!y.includes('valgrind')||!y.includes('size-limit-action')) throw new Error('missing pieces'); console.log('perf.yml looks structurally complete')"`
Expected: prints "perf.yml looks structurally complete". (Full validation happens when the PR runs CI — note the Node-22/valgrind version-coupling risk in Task 13's parity check.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/perf.yml
git commit -m "chore | ci: add perf workflow (callgrind runtime gate + size-limit)"
```

---

## Task 12: Re-baseline workflow — `perf-baseline.yml`

**Files:**
- Create: `.github/workflows/perf-baseline.yml`

Manually triggered. Regenerates `bench/baseline.json` on the pinned toolchain (guaranteeing parity with the gate's environment) and opens a PR with the new numbers, so the change is reviewed rather than silently pushed.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/perf-baseline.yml`:

```yaml
name: perf-baseline

on:
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  rebaseline:
    name: Regenerate perf baseline
    runs-on: ubuntu-24.04 # pinned: valgrind version must stay fixed (ubuntu-latest drifts)

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Install valgrind
        run: sudo apt-get update && sudo apt-get install -y valgrind

      - name: Regenerate baseline
        run: pnpm bench:update

      - name: Open PR with the new baseline
        uses: peter-evans/create-pull-request@v6
        with:
          branch: perf/rebaseline
          title: "chore | refresh perf baseline"
          commit-message: "chore | refresh perf baseline"
          body: |
            Regenerated `bench/baseline.json` on the pinned CI toolchain
            (Node 22 + distro valgrind) via the `perf-baseline` workflow.
          add-paths: bench/baseline.json
```

> **Two one-time operational notes** (not YAML errors): (1) `create-pull-request` requires the repo/org setting **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** to be enabled, or it 403s despite correct permissions. (2) A PR opened by the default `GITHUB_TOKEN` does **not** trigger other workflows, so the auto-created re-baseline PR will not itself run `perf.yml`. That's fine here — the baseline is what the gate compares against, so it doesn't need to be gated by itself; just review the numbers in the PR. (If you ever want the re-baseline PR gate-checked, pass a PAT via the action's `token` input.)

- [ ] **Step 2: Validate the workflow YAML**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/perf-baseline.yml','utf8'); if(!y.includes('workflow_dispatch')||!y.includes('bench:update')) throw new Error('missing pieces'); console.log('perf-baseline.yml looks structurally complete')"`
Expected: prints "perf-baseline.yml looks structurally complete".

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/perf-baseline.yml
git commit -m "chore | ci: add manual re-baseline workflow"
```

---

## Task 13: Documentation — CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Add a "Performance benchmarks" section**

Insert this section into `CONTRIBUTING.md` immediately before the `## Branch and PR conventions` section (i.e. after `## Publishing a release`):

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs | contributing: document the perf benchmark gate"
```

---

## Post-implementation validation (before opening the PR)

- [ ] **Full local gate green:** `pnpm bench` prints all `✅ ok`, exits 0.
- [ ] **Unit tests green:** `pnpm test` passes and does not run `bench-sensitivity`.
- [ ] **Sensitivity proven:** `RUN_BENCH_SENSITIVITY=1 pnpm exec vitest run tests/bench-sensitivity.test.ts` passes.
- [ ] **Size gate green:** `pnpm build && pnpm size` passes.
- [ ] **Lint/format/typecheck unaffected:** `pnpm lint && pnpm format:check && pnpm typecheck`.
- [ ] **Replace the provisional baseline with a CI-toolchain one (required before trusting the gate):** the baseline committed in Task 9 was generated on this dev box (Node 24 / valgrind 3.26) and will *not* match the gate's Node 22 / distro-valgrind measurements. Regenerate it on the pinned CI toolchain — trigger the `perf-baseline` workflow (or use a Node 22 + `apt-get install valgrind` environment) — and commit that `bench/baseline.json`. Then confirm a no-op PR shows ~0% deltas against it. If Node 22 + the distro valgrind hits a SIGILL/unhandled-instruction, install valgrind ≥3.24 and pin that version in `perf.yml`. This is the single step the dev environment could not validate directly.
```

---

## Notes carried from the spec

- **Thresholds:** warn ≥1%, fail ≥3% (in `gate.mjs`).
- **Inform-first:** `continue-on-error: true` on the runtime job; promote to a required check via branch protection once trusted.
- **Toolchain pinning:** Node 22 + distro valgrind as the starting pair; the parity re-check may force a newer valgrind.
- **Out of scope:** native addon, CodSpeed, dashboards, gh-pages branch, running the gate across the full Node matrix.
