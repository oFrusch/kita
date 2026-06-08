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
