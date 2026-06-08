import { describe, it, expect, vi } from "vitest";
import { RequestTracker } from "../src/utils/request-tracker";

describe("RequestTracker", () => {
  describe("dedupe", () => {
    it("should execute a request and return its result", async () => {
      const tracker = new RequestTracker();
      const result = await tracker.dedupe("test-key", async () => "hello");
      expect(result).toBe("hello");
    });

    it("should deduplicate concurrent requests with the same key", async () => {
      const tracker = new RequestTracker();
      const requestFn = vi.fn().mockResolvedValue("result");

      // Start two requests with the same key concurrently
      const promise1 = tracker.dedupe("same-key", requestFn);
      const promise2 = tracker.dedupe("same-key", requestFn);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should return the same result
      expect(result1).toBe("result");
      expect(result2).toBe("result");

      // But the request function should only be called once
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it("should not deduplicate requests with different keys", async () => {
      const tracker = new RequestTracker();
      const requestFn = vi.fn().mockResolvedValue("result");

      // Start two requests with different keys concurrently
      const promise1 = tracker.dedupe("key-1", requestFn);
      const promise2 = tracker.dedupe("key-2", requestFn);

      await Promise.all([promise1, promise2]);

      // Request function should be called twice
      expect(requestFn).toHaveBeenCalledTimes(2);
    });

    it("should allow new requests after the first completes", async () => {
      const tracker = new RequestTracker();
      let callCount = 0;
      const requestFn = vi.fn().mockImplementation(async () => {
        callCount++;
        return `result-${callCount}`;
      });

      // First request
      const result1 = await tracker.dedupe("key", requestFn);
      expect(result1).toBe("result-1");

      // Second request after first completes
      const result2 = await tracker.dedupe("key", requestFn);
      expect(result2).toBe("result-2");

      // Both requests should have executed
      expect(requestFn).toHaveBeenCalledTimes(2);
    });

    it("should clean up pending request after rejection", async () => {
      const tracker = new RequestTracker();
      const error = new Error("Test error");
      const failingRequest = vi.fn().mockRejectedValue(error);
      const successRequest = vi.fn().mockResolvedValue("success");

      // First request fails
      await expect(tracker.dedupe("key", failingRequest)).rejects.toThrow("Test error");

      // Second request with same key should work
      const result = await tracker.dedupe("key", successRequest);
      expect(result).toBe("success");
      expect(successRequest).toHaveBeenCalledTimes(1);
    });

    it("should share rejection among concurrent callers", async () => {
      const tracker = new RequestTracker();
      const error = new Error("Shared error");
      const failingRequest = vi.fn().mockRejectedValue(error);

      // Start two requests with the same key
      const promise1 = tracker.dedupe("key", failingRequest);
      const promise2 = tracker.dedupe("key", failingRequest);

      // Both should reject with the same error
      await expect(promise1).rejects.toThrow("Shared error");
      await expect(promise2).rejects.toThrow("Shared error");

      // But the request should only execute once
      expect(failingRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("hasPending", () => {
    it("should return false when no request is pending", () => {
      const tracker = new RequestTracker();
      expect(tracker.hasPending("key")).toBe(false);
    });

    it("should return true while a request is in flight", async () => {
      const tracker = new RequestTracker();
      let resolveRequest: () => void;
      const controlledPromise = new Promise<string>((resolve) => {
        resolveRequest = () => resolve("done");
      });

      // Start request but don't await yet
      const pendingPromise = tracker.dedupe("key", () => controlledPromise);
      expect(tracker.hasPending("key")).toBe(true);

      // Resolve the request
      resolveRequest!();
      await pendingPromise;

      // Now it should be gone
      expect(tracker.hasPending("key")).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all pending requests", async () => {
      const tracker = new RequestTracker();
      let resolveRequest1: () => void;
      let resolveRequest2: () => void;

      const promise1 = new Promise<string>((resolve) => {
        resolveRequest1 = () => resolve("done1");
      });
      const promise2 = new Promise<string>((resolve) => {
        resolveRequest2 = () => resolve("done2");
      });

      // Start two requests
      tracker.dedupe("key1", () => promise1);
      tracker.dedupe("key2", () => promise2);

      expect(tracker.hasPending("key1")).toBe(true);
      expect(tracker.hasPending("key2")).toBe(true);

      // Clear all
      tracker.clear();

      expect(tracker.hasPending("key1")).toBe(false);
      expect(tracker.hasPending("key2")).toBe(false);

      // Clean up promises to prevent unhandled rejections
      resolveRequest1!();
      resolveRequest2!();
    });
  });

  describe("type safety", () => {
    it("should preserve return type through generic", async () => {
      const tracker = new RequestTracker();

      interface User {
        id: string;
        name: string;
      }

      const user: User = { id: "1", name: "Test" };
      const result = await tracker.dedupe<User>("user-key", async () => user);

      // TypeScript should infer that result is User
      expect(result.id).toBe("1");
      expect(result.name).toBe("Test");
    });
  });
});
