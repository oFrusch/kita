import { AsyncStore } from "../../src/stores";
import { AsyncModel } from "../../src/models";
import type { HttpClient } from "../../src/http";

// Cast: never invoked (peek is pure Map lookups), so it only needs to satisfy
// the constructor. A plain literal can't match HttpClient's generic method
// signatures, and esbuild strips the cast — the emitted JS is identical.
const client = {
  get: async () => ({ data: {} }),
  post: async () => ({ data: {} }),
  put: async () => ({ data: {} }),
  delete: async () => ({ data: {} }),
} as unknown as HttpClient;

class UserModel extends AsyncModel {
  static readonly id = "users";
  declare email: string;
}
class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";
}

const SIZE = 1000;

export const isAsync = false;
export const warmup = 200;

export function setup() {
  const store = new UserStore(client, {});
  const ids: string[] = [];
  for (let i = 0; i < SIZE; i++) {
    const m = new UserModel({ id: String(i), email: `u${i}@x.com` });
    store._pushRecord(m);
    ids.push(m.id);
  }
  return { store, ids };
}

// Read-only Map lookups against a store populated once — no mutation, perfectly
// linear. Loop all ids so the body does real work; return the last hit's id.
export function body(state: { store: UserStore; ids: string[] }): number {
  let hit: UserModel | undefined;
  const { store, ids } = state;
  for (let i = 0; i < ids.length; i++) hit = store.peekRecord(ids[i]);
  return hit ? Number(hit.id) : 0;
}
