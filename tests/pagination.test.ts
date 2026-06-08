import { describe, it, expect, vi } from "vitest";
import { PaginatedQuery, type PaginatedResult } from "../src/utils/pagination";

describe("PaginatedQuery", () => {
  const createMockFetcher = (totalPages: number, itemsPerPage: number) => {
    return vi.fn().mockImplementation(async (page: number): Promise<PaginatedResult<string>> => {
      const records = Array.from(
        { length: itemsPerPage },
        (_, i) => `item-${(page - 1) * itemsPerPage + i + 1}`,
      );
      return {
        records,
        meta: {
          page,
          totalPages,
          totalCount: totalPages * itemsPerPage,
          hasMore: page < totalPages,
        },
      };
    });
  };

  describe("initial state", () => {
    it("should start at page 1 with hasMore true", () => {
      const query = new PaginatedQuery(createMockFetcher(3, 10));

      expect(query.page).toBe(1);
      expect(query.hasMore).toBe(true);
      expect(query.isLoading).toBe(false);
      expect(query.totalCount).toBe(0);
      expect(query.totalPages).toBe(0);
    });
  });

  describe("loadMore", () => {
    it("should fetch first page of records", async () => {
      const fetcher = createMockFetcher(3, 2);
      const query = new PaginatedQuery(fetcher);

      const records = await query.loadMore();

      expect(records).toEqual(["item-1", "item-2"]);
      expect(fetcher).toHaveBeenCalledWith(1);
      expect(query.page).toBe(2);
      expect(query.hasMore).toBe(true);
    });

    it("should fetch subsequent pages", async () => {
      const fetcher = createMockFetcher(3, 2);
      const query = new PaginatedQuery(fetcher);

      await query.loadMore();
      const records = await query.loadMore();

      expect(records).toEqual(["item-3", "item-4"]);
      expect(fetcher).toHaveBeenCalledWith(2);
      expect(query.page).toBe(3);
    });

    it("should update hasMore to false on last page", async () => {
      const fetcher = createMockFetcher(2, 2);
      const query = new PaginatedQuery(fetcher);

      await query.loadMore();
      expect(query.hasMore).toBe(true);

      await query.loadMore();
      expect(query.hasMore).toBe(false);
    });

    it("should return empty array when no more pages", async () => {
      const fetcher = createMockFetcher(1, 2);
      const query = new PaginatedQuery(fetcher);

      await query.loadMore();
      const records = await query.loadMore();

      expect(records).toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should update totalCount and totalPages", async () => {
      const fetcher = createMockFetcher(5, 10);
      const query = new PaginatedQuery(fetcher);

      await query.loadMore();

      expect(query.totalCount).toBe(50);
      expect(query.totalPages).toBe(5);
    });

    it("should set isLoading during fetch", async () => {
      let resolvePromise: (value: PaginatedResult<string>) => void;
      const controlledFetcher = vi.fn().mockImplementation(
        () =>
          new Promise<PaginatedResult<string>>((resolve) => {
            resolvePromise = resolve;
          }),
      );

      const query = new PaginatedQuery(controlledFetcher);

      const loadPromise = query.loadMore();
      expect(query.isLoading).toBe(true);

      resolvePromise!({
        records: ["item"],
        meta: { page: 1, totalPages: 1, totalCount: 1, hasMore: false },
      });
      await loadPromise;

      expect(query.isLoading).toBe(false);
    });

    it("should not allow concurrent loads", async () => {
      let resolvePromise: (value: PaginatedResult<string>) => void;
      const controlledFetcher = vi.fn().mockImplementation(
        () =>
          new Promise<PaginatedResult<string>>((resolve) => {
            resolvePromise = resolve;
          }),
      );

      const query = new PaginatedQuery(controlledFetcher);

      const loadPromise1 = query.loadMore();
      const loadPromise2 = query.loadMore();

      expect(await loadPromise2).toEqual([]);
      expect(controlledFetcher).toHaveBeenCalledTimes(1);

      resolvePromise!({
        records: ["item"],
        meta: { page: 1, totalPages: 2, totalCount: 2, hasMore: true },
      });
      await loadPromise1;
    });

    it("should reset isLoading on error", async () => {
      const error = new Error("Network error");
      const failingFetcher = vi.fn().mockRejectedValue(error);
      const query = new PaginatedQuery(failingFetcher);

      await expect(query.loadMore()).rejects.toThrow("Network error");

      expect(query.isLoading).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset to initial state", async () => {
      const fetcher = createMockFetcher(3, 2);
      const query = new PaginatedQuery(fetcher);

      await query.loadMore();
      await query.loadMore();

      query.reset();

      expect(query.page).toBe(1);
      expect(query.hasMore).toBe(true);
      expect(query.isLoading).toBe(false);
      expect(query.totalCount).toBe(0);
      expect(query.totalPages).toBe(0);
    });

    it("should allow fetching from beginning after reset", async () => {
      const fetcher = createMockFetcher(2, 2);
      const query = new PaginatedQuery(fetcher);

      await query.loadMore();
      await query.loadMore();
      expect(query.hasMore).toBe(false);

      query.reset();

      const records = await query.loadMore();
      expect(records).toEqual(["item-1", "item-2"]);
      expect(fetcher).toHaveBeenCalledWith(1);
    });
  });

  describe("type safety", () => {
    it("should preserve record type", async () => {
      interface User {
        id: number;
        name: string;
      }

      const users: User[] = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];

      const fetcher = vi.fn().mockResolvedValue({
        records: users,
        meta: { page: 1, totalPages: 1, totalCount: 2, hasMore: false },
      });

      const query = new PaginatedQuery<User>(fetcher);
      const records = await query.loadMore();

      expect(records[0].id).toBe(1);
      expect(records[0].name).toBe("Alice");
    });
  });
});
