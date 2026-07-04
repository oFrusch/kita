import { withOptimisticUpdate } from "../../src/utils";

export const isAsync = true;
export const warmup = 2000;

export function setup() {
  const record = { id: "1", name: "original", version: 1 };
  const failServer = () => Promise.reject(new Error("network"));
  return { record, failServer };
}

// Error path: optimistic mutate -> server rejects -> withOptimisticUpdate rolls
// back (restores record.name) and rethrows -> we catch. The shared record
// self-heals to "original" each iteration, so it stays linear.
export async function body(state: {
  record: { id: string; name: string; version: number };
  failServer: () => Promise<never>;
}): Promise<number> {
  const { record, failServer } = state;
  try {
    await withOptimisticUpdate(
      () => {
        const snap = { ...record };
        record.name = "optimistic";
        return snap;
      },
      failServer,
      (snap) => {
        record.name = snap.name;
      },
    );
    return 0;
  } catch {
    return record.name.length; // rollback restored "original"
  }
}
