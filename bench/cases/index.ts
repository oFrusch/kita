import * as sanity from "./_sanity.bench";
import * as reactiveConstruct from "./reactive-construct.bench";
import * as reactiveWrite from "./reactive-write.bench";
import * as storeBulkPush from "./store-bulk-push.bench";
import * as storePeek from "./store-peek.bench";
import * as queryCache from "./query-cache.bench";
import * as requestDedupe from "./request-dedupe.bench";
import * as paginationLoadMore from "./pagination-loadmore.bench";
import * as optimisticSuccess from "./optimistic-success.bench";
import * as optimisticRollback from "./optimistic-rollback.bench";

export interface BenchCase {
  isAsync?: boolean;
  warmup?: number;
  setup: () => unknown;
  body: (state: never) => unknown;
}

export const REGISTRY: Record<string, BenchCase> = {
  _sanity: sanity as unknown as BenchCase,
  "reactive-construct": reactiveConstruct as unknown as BenchCase,
  "reactive-write": reactiveWrite as unknown as BenchCase,
  "store-bulk-push": storeBulkPush as unknown as BenchCase,
  "store-peek": storePeek as unknown as BenchCase,
  "query-cache": queryCache as unknown as BenchCase,
  "request-dedupe": requestDedupe as unknown as BenchCase,
  "pagination-loadmore": paginationLoadMore as unknown as BenchCase,
  "optimistic-success": optimisticSuccess as unknown as BenchCase,
  "optimistic-rollback": optimisticRollback as unknown as BenchCase,
};
