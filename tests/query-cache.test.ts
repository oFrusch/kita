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
