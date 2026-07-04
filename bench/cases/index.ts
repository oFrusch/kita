import * as sanity from "./_sanity.bench";

export interface BenchCase {
  isAsync?: boolean;
  warmup?: number;
  setup: () => unknown;
  body: (state: never) => unknown;
}

export const REGISTRY: Record<string, BenchCase> = {
  _sanity: sanity as unknown as BenchCase,
};
