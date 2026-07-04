import reactive from "../../src/decorators/reactive";

class ReactiveModel {
  @reactive() accessor a = 1;
  @reactive() accessor b = "hello";
  @reactive() accessor c: string[] = [];
}

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  return { inst: new ReactiveModel(), n: 0 };
}

// Setter path: WeakMap.get(this) + assign ref.value in place. Bounded 32-bit
// counter so nothing grows. Warmup-safe on the shared instance.
export function body(state: { inst: ReactiveModel; n: number }): number {
  state.n = (state.n + 1) | 0;
  state.inst.a = state.n;
  return state.inst.a | 0;
}
