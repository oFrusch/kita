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
