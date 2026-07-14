import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { QueryCache } from "../src/utils/query-cache";

describe("QueryCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("get/set", () => {
    it("should store and retrieve cached data", () => {
      const cache = new QueryCache<string>();
      const data = ["item1", "item2"];

      cache.set({ page: 1 }, data);
      const result = cache.get({ page: 1 });

      expect(result).toEqual(data);
    });

    it("should return null for non-existent entries", () => {
      const cache = new QueryCache<string>();

      const result = cache.get({ page: 1 });

      expect(result).toBeNull();
    });

    it("getEntry returns records plus stored meta", () => {
      const cache = new QueryCache<string>();
      cache.set({ page: 1 }, ["a"], { page: 1, hasMore: true });

      const entry = cache.getEntry({ page: 1 });
      expect(entry).toEqual({ data: ["a"], meta: { page: 1, hasMore: true } });

      // get() still returns just the records (unchanged contract)
      expect(cache.get({ page: 1 })).toEqual(["a"]);
    });

    it("getEntry returns null for an expired entry", () => {
      const cache = new QueryCache<string>(1000);
      cache.set({ page: 1 }, ["a"], { page: 1 });

      vi.advanceTimersByTime(1001);

      expect(cache.getEntry({ page: 1 })).toBeNull();
    });

    it("should create consistent keys regardless of property order", () => {
      const cache = new QueryCache<string>();
      const data = ["item1", "item2"];

      cache.set({ page: 1, filter: "active" }, data);
      const result = cache.get({ filter: "active", page: 1 });

      expect(result).toEqual(data);
    });
  });

  describe("TTL expiration", () => {
    it("should return data before TTL expires", () => {
      const cache = new QueryCache<string>(1000);
      cache.set({ page: 1 }, ["item"]);

      vi.advanceTimersByTime(500);

      expect(cache.get({ page: 1 })).toEqual(["item"]);
    });

    it("should return null after TTL expires", () => {
      const cache = new QueryCache<string>(1000);
      cache.set({ page: 1 }, ["item"]);

      vi.advanceTimersByTime(1001);

      expect(cache.get({ page: 1 })).toBeNull();
    });

    it("should use custom TTL when provided to get", () => {
      const cache = new QueryCache<string>(10000);
      cache.set({ page: 1 }, ["item"]);

      vi.advanceTimersByTime(500);

      expect(cache.get({ page: 1 }, 100)).toBeNull();

      cache.set({ page: 2 }, ["item2"]);
      expect(cache.get({ page: 2 })).toEqual(["item2"]);
    });

    it("should clean up expired entries on get", () => {
      const cache = new QueryCache<string>(1000);
      cache.set({ page: 1 }, ["item"]);

      vi.advanceTimersByTime(1001);

      cache.get({ page: 1 });
      expect(cache.size).toBe(0);
    });
  });

  describe("has", () => {
    it("should return true for valid cached entry", () => {
      const cache = new QueryCache<string>(1000);
      cache.set({ page: 1 }, ["item"]);

      expect(cache.has({ page: 1 })).toBe(true);
    });

    it("should return false for non-existent entry", () => {
      const cache = new QueryCache<string>();

      expect(cache.has({ page: 1 })).toBe(false);
    });

    it("should return false for expired entry", () => {
      const cache = new QueryCache<string>(1000);
      cache.set({ page: 1 }, ["item"]);

      vi.advanceTimersByTime(1001);

      expect(cache.has({ page: 1 })).toBe(false);
    });
  });

  describe("invalidate", () => {
    it("should clear all entries when no predicate is provided", () => {
      const cache = new QueryCache<string>();
      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);
      cache.set({ page: 3 }, ["item3"]);

      cache.invalidate();

      expect(cache.size).toBe(0);
    });

    it("should only clear matching entries with predicate", () => {
      const cache = new QueryCache<string>();
      cache.set({ page: 1, type: "active" }, ["item1"]);
      cache.set({ page: 2, type: "active" }, ["item2"]);
      cache.set({ page: 1, type: "inactive" }, ["item3"]);

      cache.invalidate((params) => params.type === "active");

      expect(cache.size).toBe(1);
      expect(cache.get({ page: 1, type: "inactive" })).toEqual(["item3"]);
    });

    it("should keep non-matching entries", () => {
      const cache = new QueryCache<string>();
      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);

      cache.invalidate((params) => params.page === 1);

      expect(cache.get({ page: 1 })).toBeNull();
      expect(cache.get({ page: 2 })).toEqual(["item2"]);
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      const cache = new QueryCache<string>();
      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get({ page: 1 })).toBeNull();
      expect(cache.get({ page: 2 })).toBeNull();
    });
  });

  describe("size", () => {
    it("should return the number of cached entries", () => {
      const cache = new QueryCache<string>();

      expect(cache.size).toBe(0);

      cache.set({ page: 1 }, ["item1"]);
      expect(cache.size).toBe(1);

      cache.set({ page: 2 }, ["item2"]);
      expect(cache.size).toBe(2);
    });

    it("should not count expired entries after cleanup", () => {
      const cache = new QueryCache<string>(1000);
      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);

      vi.advanceTimersByTime(1001);

      cache.get({ page: 1 });
      cache.get({ page: 2 });

      expect(cache.size).toBe(0);
    });
  });

  describe("options constructor", () => {
    it("should apply both ttl and maxSize", () => {
      const cache = new QueryCache<string>({ ttl: 1000, maxSize: 2 });

      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);
      cache.set({ page: 3 }, ["item3"]);

      expect(cache.size).toBe(2);
      expect(cache.get({ page: 1 })).toBeNull();

      vi.advanceTimersByTime(1001);

      expect(cache.get({ page: 3 })).toBeNull();
    });

    it("should keep the default ttl when only maxSize is specified", () => {
      const cache = new QueryCache<string>({ maxSize: 1 });

      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);

      expect(cache.size).toBe(1);
      expect(cache.get({ page: 2 })).toEqual(["item2"]);

      vi.advanceTimersByTime(60_001);

      expect(cache.get({ page: 2 })).toBeNull();
    });

    it("should reject an invalid maxSize with a RangeError", () => {
      expect(() => new QueryCache<string>({ maxSize: 0 })).toThrow(RangeError);
      expect(() => new QueryCache<string>({ maxSize: -1 })).toThrow(RangeError);
      expect(() => new QueryCache<string>({ maxSize: 1.5 })).toThrow(RangeError);
      expect(() => new QueryCache<string>({ maxSize: NaN })).toThrow(RangeError);
    });

    it("should reject an invalid ttl with a RangeError", () => {
      expect(() => new QueryCache<string>(0)).toThrow(RangeError);
      expect(() => new QueryCache<string>(-1000)).toThrow(RangeError);
      expect(() => new QueryCache<string>({ ttl: 1.5 })).toThrow(RangeError);
      expect(() => new QueryCache<string>({ ttl: NaN })).toThrow(RangeError);
    });
  });

  describe("bounded size", () => {
    it("should sweep an expired entry that is never read when another key is written", () => {
      const cache = new QueryCache<string>({ ttl: 1000 });
      cache.set({ q: "stale" }, ["item1"]);

      vi.advanceTimersByTime(1001);

      cache.set({ q: "fresh" }, ["item2"]);

      expect(cache.size).toBe(1);
      expect(cache.get({ q: "fresh" })).toEqual(["item2"]);
    });

    it("should not sweep entries that are still fresh", () => {
      const cache = new QueryCache<string>({ ttl: 1000 });
      cache.set({ page: 1 }, ["item1"]);

      vi.advanceTimersByTime(500);

      cache.set({ page: 2 }, ["item2"]);

      expect(cache.size).toBe(2);
      expect(cache.get({ page: 1 })).toEqual(["item1"]);
    });

    it("should evict the oldest entry once maxSize is exceeded", () => {
      const cache = new QueryCache<string>({ maxSize: 3 });
      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);
      cache.set({ page: 3 }, ["item3"]);

      cache.set({ page: 4 }, ["item4"]);

      expect(cache.get({ page: 1 })).toBeNull();
      expect(cache.get({ page: 2 })).toEqual(["item2"]);
      expect(cache.get({ page: 3 })).toEqual(["item3"]);
      expect(cache.get({ page: 4 })).toEqual(["item4"]);
    });

    it("should make a re-written key the newest entry", () => {
      const cache = new QueryCache<string>({ maxSize: 2 });
      cache.set({ page: 1 }, ["item1"]);
      cache.set({ page: 2 }, ["item2"]);

      cache.set({ page: 1 }, ["item1-updated"]);
      cache.set({ page: 3 }, ["item3"]);

      expect(cache.get({ page: 2 })).toBeNull();
      expect(cache.get({ page: 1 })).toEqual(["item1-updated"]);
      expect(cache.get({ page: 3 })).toEqual(["item3"]);
    });

    it("should never exceed maxSize across a long write loop", () => {
      const cache = new QueryCache<string>({ maxSize: 5 });

      Array.from({ length: 50 }, (_, index) => index).forEach((index) => {
        cache.set({ q: `search-${index}` }, [`item${index}`]);
        expect(cache.size).toBeLessThanOrEqual(5);
      });

      expect(cache.size).toBe(5);
      expect(cache.get({ q: "search-49" })).toEqual(["item49"]);
      expect(cache.get({ q: "search-44" })).toBeNull();
    });

    it("should default maxSize to 100", () => {
      const cache = new QueryCache<string>();

      Array.from({ length: 150 }, (_, index) => index).forEach((index) => {
        cache.set({ q: `search-${index}` }, [`item${index}`]);
      });

      expect(cache.size).toBe(100);
    });
  });

  describe("per-entry ttl", () => {
    it("should not sweep a longer-lived entry when an unrelated key is written", () => {
      const cache = new QueryCache<string>();

      cache.set({ q: "a" }, ["a"], undefined, 300_000);

      vi.advanceTimersByTime(70_000);
      cache.set({ q: "b" }, ["b"]);

      expect(cache.get({ q: "a" }, 300_000)).toEqual(["a"]);
    });

    it("should sweep a longer-lived entry once its own ttl elapses", () => {
      const cache = new QueryCache<string>();

      cache.set({ q: "a" }, ["a"], undefined, 300_000);

      vi.advanceTimersByTime(300_001);
      cache.set({ q: "b" }, ["b"]);

      expect(cache.size).toBe(1);
      expect(cache.get({ q: "a" }, 300_000)).toBeNull();
    });

    it("should sweep a shorter-lived entry before the cache default elapses", () => {
      const cache = new QueryCache<string>();

      cache.set({ q: "a" }, ["a"], undefined, 5_000);

      vi.advanceTimersByTime(5_001);
      cache.set({ q: "b" }, ["b"]);

      expect(cache.size).toBe(1);
    });
  });

  describe("type safety", () => {
    it("should preserve array element type", () => {
      interface User {
        id: number;
        name: string;
      }

      const cache = new QueryCache<User>();
      const users: User[] = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];

      cache.set({ role: "admin" }, users);
      const result = cache.get({ role: "admin" });

      expect(result?.[0].id).toBe(1);
      expect(result?.[0].name).toBe("Alice");
    });
  });
});
