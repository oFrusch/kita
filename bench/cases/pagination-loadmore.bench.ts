import { PaginatedQuery } from "../../src/utils";
import type { PaginatedResult } from "../../src/utils";

const PAGE_SIZE = 20;

export const isAsync = true;
export const warmup = 2000;

export function setup() {
  // In-memory fetcher, always hasMore:true so loadMore never short-circuits.
  const fetcher = (page: number): Promise<PaginatedResult<string>> =>
    Promise.resolve({
      records: Array.from(
        { length: PAGE_SIZE },
        (_, i) => `item-${(page - 1) * PAGE_SIZE + i + 1}`,
      ),
      meta: {
        page,
        totalPages: 1_000_000,
        totalCount: PAGE_SIZE * 1_000_000,
        hasMore: true,
      },
    });
  return { query: new PaginatedQuery<string>(fetcher) };
}

// Full loadMore path; MUST be awaited (isLoading guard would short-circuit an
// un-awaited concurrent call). Only _currentPage (an int) grows — no record
// accumulation inside the query.
export async function body(state: {
  query: PaginatedQuery<string>;
}): Promise<number> {
  const records = await state.query.loadMore();
  return records.length;
}
