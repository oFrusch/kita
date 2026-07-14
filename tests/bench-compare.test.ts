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
