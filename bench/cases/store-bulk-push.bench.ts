import { AsyncStore } from "../../src/stores";
import { AsyncModel } from "../../src/models";
import type { HttpClient } from "../../src/http";

// Real HttpClient shape, but a PLAIN object (not vi.fn) — the push path never
// calls it; it only satisfies the constructor.
const client: HttpClient = {
  get: async () => ({ data: {} }),
  post: async () => ({ data: {} }),
  put: async () => ({ data: {} }),
  delete: async () => ({ data: {} }),
};

class UserModel extends AsyncModel {
  static readonly id = "users";
  declare email: string;
}
class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";
}

const BULK = 1000;

export const isAsync = false;
export const warmup = 50;

export function setup() {
  // Pre-build BULK models with UNIQUE ids via `new` (NOT create(), which would
  // auto-push into the registry singleton). All-unique ids => every push hits
  // the INSERT branch, never the merge branch.
  const records = Array.from(
    { length: BULK },
    (_, i) => new UserModel({ id: String(i), email: `u${i}@x.com` }),
  );
  return { records };
}

// Fresh store per call, discarded each iteration => its Map/array never carry
// over (self-contained, linear). Measures the full normalization/push path.
export function body(state: { records: UserModel[] }): number {
  const store = new UserStore(client, {});
  const recs = state.records;
  for (let i = 0; i < recs.length; i++) store._pushRecord(recs[i]);
  return store.records.length;
}
