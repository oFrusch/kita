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
