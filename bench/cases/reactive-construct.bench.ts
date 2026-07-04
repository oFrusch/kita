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
