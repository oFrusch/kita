import { withOptimisticUpdate } from "../../src/utils";

export const isAsync = true;
export const warmup = 2000;

export function setup() {
  const record = { id: "1", name: "original", version: 1 };
  const okServer = () => Promise.resolve({ id: "1", name: "confirmed", version: 2 });
  return { record, okServer };
}

// Happy path: snapshot + optimistic mutate -> await server -> return result.
// One small snapshot allocated per call (GC'd); single field reassigned on the
// shared record — constant memory.
export async function body(state: {
  record: { id: string; name: string; version: number };
  okServer: () => Promise<{ id: string; name: string; version: number }>;
}): Promise<number> {
  const { record, okServer } = state;
  const result = await withOptimisticUpdate(
    () => {
      const snap = { ...record };
      record.name = "optimistic";
      return snap;
    },
    okServer,
    (snap) => {
      record.name = snap.name;
    },
  );
  return result.version;
}
