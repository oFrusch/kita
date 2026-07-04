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
