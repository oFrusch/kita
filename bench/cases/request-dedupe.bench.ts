import { RequestTracker } from "../../src/utils/request-tracker";

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  const tracker = new RequestTracker();
  const key = "resource:list:page-1";
  const resolved = () => Promise.resolve("payload");
  return { tracker, key, resolved };
}

// Same key each call: the first call registers a pending promise, subsequent
// calls hit the dedup branch and return it — the pending Map stays capped at 1.
// We create the promise (a real side effect) but don't await; DCE-safe because
// dedupe mutates the Map.
export function body(state: {
  tracker: RequestTracker;
  key: string;
  resolved: () => Promise<string>;
}): number {
  const p: unknown = state.tracker.dedupe(state.key, state.resolved);
  return p ? 1 : 0;
}
