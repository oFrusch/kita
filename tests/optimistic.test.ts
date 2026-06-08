import { describe, it, expect, vi } from "vitest";
import { withOptimisticUpdate } from "../src/utils/optimistic";

describe("withOptimisticUpdate", () => {
  it("should execute optimistic action before server action", async () => {
    const callOrder: string[] = [];

    await withOptimisticUpdate(
      () => {
        callOrder.push("optimistic");
        return "snapshot";
      },
      async () => {
        callOrder.push("server");
        return "result";
      },
      () => {
        callOrder.push("rollback");
      },
    );

    expect(callOrder).toEqual(["optimistic", "server"]);
  });

  it("should return the server action result", async () => {
    const result = await withOptimisticUpdate(
      () => "snapshot",
      async () => "server-result",
      () => {},
    );

    expect(result).toBe("server-result");
  });

  it("should call rollback with snapshot on server error", async () => {
    const rollback = vi.fn();
    const error = new Error("Server error");

    await expect(
      withOptimisticUpdate(
        () => ({ data: "original" }),
        async () => {
          throw error;
        },
        rollback,
      ),
    ).rejects.toThrow("Server error");

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledWith({ data: "original" });
  });

  it("should not call rollback on success", async () => {
    const rollback = vi.fn();

    await withOptimisticUpdate(
      () => "snapshot",
      async () => "result",
      rollback,
    );

    expect(rollback).not.toHaveBeenCalled();
  });

  it("should preserve the snapshot type", async () => {
    interface Snapshot {
      id: string;
      name: string;
      version: number;
    }

    const originalData: Snapshot = { id: "1", name: "Test", version: 1 };
    let capturedSnapshot: Snapshot | null = null;

    await expect(
      withOptimisticUpdate<Snapshot, void>(
        () => originalData,
        async () => {
          throw new Error("fail");
        },
        (snapshot) => {
          capturedSnapshot = snapshot;
        },
      ),
    ).rejects.toThrow("fail");

    expect(capturedSnapshot).toEqual(originalData);
  });

  it("should work with async operations in optimistic action", async () => {
    let storeState = "initial";

    const result = await withOptimisticUpdate(
      () => {
        const snapshot = storeState;
        storeState = "optimistic";
        return snapshot;
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        storeState = "confirmed";
        return storeState;
      },
      (snapshot) => {
        storeState = snapshot;
      },
    );

    expect(result).toBe("confirmed");
    expect(storeState).toBe("confirmed");
  });

  it("should restore state on error", async () => {
    let storeState = "initial";

    await expect(
      withOptimisticUpdate(
        () => {
          const snapshot = storeState;
          storeState = "optimistic";
          return snapshot;
        },
        async () => {
          throw new Error("Network error");
        },
        (snapshot) => {
          storeState = snapshot;
        },
      ),
    ).rejects.toThrow("Network error");

    expect(storeState).toBe("initial");
  });

  it("should handle complex snapshot objects", async () => {
    interface ComplexState {
      items: string[];
      metadata: { count: number };
    }

    const state: ComplexState = {
      items: ["a", "b"],
      metadata: { count: 2 },
    };

    await expect(
      withOptimisticUpdate(
        () => {
          const snapshot = JSON.parse(JSON.stringify(state)) as ComplexState;
          state.items.push("c");
          state.metadata.count = 3;
          return snapshot;
        },
        async () => {
          throw new Error("fail");
        },
        (snapshot) => {
          state.items = snapshot.items;
          state.metadata = snapshot.metadata;
        },
      ),
    ).rejects.toThrow("fail");

    expect(state.items).toEqual(["a", "b"]);
    expect(state.metadata.count).toBe(2);
  });
});
