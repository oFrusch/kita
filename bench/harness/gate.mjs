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
