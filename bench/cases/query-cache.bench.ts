import { QueryCache } from "../../src/utils/query-cache";

export const isAsync = false;
export const warmup = 5000;

export function setup() {
  const cache = new QueryCache<string>();
  // Multi-key, deliberately unsorted so makeKey's Object.keys().sort() does work.
  const params = { page: 1, filter: "active", sort: "name", limit: 50 };
  const data = ["item1", "item2", "item3"];
  cache.set(params, data);
  return { cache, params, data };
}

// set + get with the same key: overwrites (cache size stays 1), exercising the
// sorted-key JSON serialization twice + the Date.now() TTL check. Bounded.
export function body(state: {
  cache: QueryCache<string>;
  params: Record<string, unknown>;
  data: string[];
}): number {
  state.cache.set(state.params, state.data);
  const got = state.cache.get(state.params);
  return got ? got.length : 0;
}
