// Gate case list with per-case iteration counts (N). Names must match the keys
// in bench/cases/index.ts. `_sanity` is intentionally excluded (harness-only).
export const CASES = [
  { name: "reactive-construct", N: 100_000 },
  { name: "reactive-write", N: 200_000 },
  { name: "store-bulk-push", N: 40 },
  { name: "store-peek", N: 1_000 },
  { name: "query-cache", N: 100_000 },
  { name: "request-dedupe", N: 100_000 },
  { name: "pagination-loadmore", N: 20_000 },
  { name: "optimistic-success", N: 20_000 },
  { name: "optimistic-rollback", N: 20_000 },
];
