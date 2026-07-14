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
