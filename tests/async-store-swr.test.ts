import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import registry from "../src/model-store-registry";
import { AsyncModel, registerModel } from "../src/models";
import { AsyncStoreSWR } from "../src/swr";
import { createMockClient, mockResponse, resetRegistry, type MockHttpClient } from "./helpers";

class UserModel extends AsyncModel {
  static readonly id = "users";
  declare email: string;
}

class UserStore extends AsyncStoreSWR<UserModel> {
  static readonly id = "users";
}

class ReportingUserStore extends AsyncStoreSWR<UserModel> {
  static readonly id = "users";

  public readonly revalidationErrors: Array<{ error: unknown; id: string }> = [];

  protected onRevalidationError(error: unknown, id: string) {
    this.revalidationErrors.push({ error, id });
  }
}

class ThrowingUserStore extends AsyncStoreSWR<UserModel> {
  static readonly id = "users";

  protected onRevalidationError(): void {
    throw new Error("reporter blew up");
  }
}

/**
 * Node only emits `unhandledRejection` once the microtask queue has drained, which
 * happens after the current tick — so a fake-timer flush alone can never observe it.
 */
async function flushRealTicks(): Promise<void> {
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function captureUnhandledRejections(): { seen: unknown[]; stop: () => void } {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => {
    seen.push(reason);
  };

  process.on("unhandledRejection", listener);

  return { seen, stop: () => process.off("unhandledRejection", listener) };
}

describe("AsyncStoreSWR", () => {
  let client: MockHttpClient;
  let store: UserStore;

  beforeEach(() => {
    resetRegistry();
    registerModel(UserModel);
    client = createMockClient();
    store = new UserStore(client, {});
    registry.registerStore("users", store);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isRecordStale", () => {
    it("returns true when no record has been fetched yet", () => {
      expect(store.isRecordStale("1", 1000)).toBe(true);
    });

    it("returns false immediately after a fetch (within staleTime)", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");
      expect(store.isRecordStale("1", 60_000)).toBe(false);
    });

    it("returns true once staleTime has elapsed", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");

      vi.advanceTimersByTime(2000);
      expect(store.isRecordStale("1", 1000)).toBe(true);
    });
  });

  describe("findRecord (SWR semantics)", () => {
    it("awaits the fetch when no cached record exists", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      const result = await store.findRecord("1");
      expect(result?.email).toBe("a");
      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it("returns the cached record without fetching when fresh", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");
      await store.findRecord("1", {}, { staleTime: 60_000 });
      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it("returns stale data immediately and refetches in the background", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");

      vi.advanceTimersByTime(2000);

      // Hold the background fetch open so we can observe the stale return synchronously.
      let resolveBackground!: (v: unknown) => void;
      client.get.mockReturnValueOnce(
        new Promise((r) => {
          resolveBackground = r;
        }),
      );

      const result = await store.findRecord("1", {}, { staleTime: 1000 });
      const emailWhileBackgroundPending = result?.email;

      // Now let the background fetch resolve and drain microtasks.
      resolveBackground(mockResponse({ id: "1", email: "b" }));
      await vi.runAllTimersAsync();

      expect(emailWhileBackgroundPending).toBe("a");
      expect(client.get).toHaveBeenCalledTimes(2);
      expect(result?.email).toBe("b"); // mutated in place once background fetch completes
    });

    it("revalidate=true triggers a background refetch even when fresh", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");

      const result = await store.findRecord("1", {}, { revalidate: true });
      expect(result?.email).toBe("a"); // returned immediately

      await vi.runAllTimersAsync();
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("legacy boolean parameter is honored (revalidate=true)", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");

      await store.findRecord("1", {}, true);
      await vi.runAllTimersAsync();
      expect(client.get).toHaveBeenCalledTimes(2);
    });
  });

  describe("failed background revalidation", () => {
    const boom = new Error("network down");

    beforeEach(async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");

      vi.advanceTimersByTime(2000);
    });

    it("still returns the stale record immediately", async () => {
      client.get.mockRejectedValueOnce(boom);

      const result = await store.findRecord("1", {}, { staleTime: 1000 });
      expect(result?.email).toBe("a");

      await vi.runAllTimersAsync();
      expect(result?.email).toBe("a");
    });

    it("resolves the stale record before the background request settles", async () => {
      const reporting = new ReportingUserStore(client, {});
      registry.registerStore("users", reporting);
      await reporting.findRecord("1");

      vi.advanceTimersByTime(2000);

      let rejectBackground!: (reason: unknown) => void;
      client.get.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectBackground = reject;
        }),
      );

      const result = await reporting.findRecord("1", {}, { staleTime: 1000 });

      expect(result?.email).toBe("a");
      expect(reporting.revalidationErrors).toHaveLength(0);

      rejectBackground(boom);
      await vi.runAllTimersAsync();

      expect(reporting.revalidationErrors).toHaveLength(1);
    });

    it("calls onRevalidationError with the error and the record id", async () => {
      const reporting = new ReportingUserStore(client, {});
      registry.registerStore("users", reporting);
      await reporting.findRecord("1");

      vi.advanceTimersByTime(2000);
      client.get.mockRejectedValueOnce(boom);

      await reporting.findRecord("1", {}, { staleTime: 1000 });
      await vi.runAllTimersAsync();

      expect(reporting.revalidationErrors).toEqual([{ error: boom, id: "1" }]);
    });

    it("does not leak an unhandled rejection", async () => {
      const { seen, stop } = captureUnhandledRejections();

      try {
        client.get.mockRejectedValueOnce(boom);

        await store.findRecord("1", {}, { staleTime: 1000 });

        await vi.runAllTimersAsync();
        await flushRealTicks();

        expect(seen).toEqual([]);
      } finally {
        stop();
      }
    });

    it("does not leak an unhandled rejection when the hook itself throws", async () => {
      const { seen, stop } = captureUnhandledRejections();

      try {
        const throwing = new ThrowingUserStore(client, {});
        registry.registerStore("users", throwing);
        await throwing.findRecord("1");

        vi.advanceTimersByTime(2000);
        client.get.mockRejectedValueOnce(boom);

        await throwing.findRecord("1", {}, { staleTime: 1000 });

        await vi.runAllTimersAsync();
        await flushRealTicks();

        expect(seen).toEqual([]);
      } finally {
        stop();
      }
    });

    it("reports once per background revalidation, not once per concurrent caller", async () => {
      const reporting = new ReportingUserStore(client, {});
      registry.registerStore("users", reporting);
      await reporting.findRecord("1");

      vi.advanceTimersByTime(2000);
      client.get.mockClear();
      client.get.mockRejectedValue(boom);

      await Promise.all([
        reporting.findRecord("1", {}, { staleTime: 1000 }),
        reporting.findRecord("1", {}, { staleTime: 1000 }),
      ]);
      await vi.runAllTimersAsync();

      expect(client.get).toHaveBeenCalledTimes(1);
      expect(reporting.revalidationErrors).toEqual([{ error: boom, id: "1" }]);
    });

    it("propagates the rejection to the caller when there is no cached record", async () => {
      const reporting = new ReportingUserStore(client, {});
      registry.registerStore("users", reporting);
      client.get.mockRejectedValueOnce(boom);

      await expect(reporting.findRecord("nope")).rejects.toThrow("network down");

      await vi.runAllTimersAsync();

      expect(reporting.revalidationErrors).toEqual([]);
    });

    it("leaves the freshness timestamp untouched so the next findRecord retries", async () => {
      client.get.mockRejectedValueOnce(boom);

      await store.findRecord("1", {}, { staleTime: 1000 });
      await vi.runAllTimersAsync();

      expect(store.isRecordStale("1", 1000)).toBe(true);

      await store.findRecord("1", {}, { staleTime: 1000 });
      await vi.runAllTimersAsync();

      expect(client.get).toHaveBeenCalledTimes(3);
      expect(store.isRecordStale("1", 1000)).toBe(false);
    });
  });

  describe("invalidateRecord", () => {
    it("drops the freshness timestamp so the next findRecord refetches", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");

      store.invalidateRecord("1");
      expect(store.isRecordStale("1", 60_000)).toBe(true);
    });
  });

  describe("reset", () => {
    it("also clears freshness timestamps", async () => {
      client.get.mockResolvedValue(mockResponse({ id: "1", email: "a" }));
      await store.findRecord("1");
      expect(store.isRecordStale("1", 60_000)).toBe(false);

      (store as any).reset();
      expect(store.isRecordStale("1", 60_000)).toBe(true);
    });
  });
});
