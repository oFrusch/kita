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
