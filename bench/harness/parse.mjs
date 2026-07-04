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
