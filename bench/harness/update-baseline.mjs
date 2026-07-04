import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases.mjs";
import { measureCase } from "./measure.mjs";
import { findValgrind } from "./valgrind.mjs";

const BASELINE = fileURLToPath(new URL("../baseline.json", import.meta.url));
const REPS = Number(process.env.BENCH_REPS ?? "2");

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
