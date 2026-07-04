// Minimal ambient declaration so `process.env.NODE_ENV` type-checks without
// pulling in all of `@types/node`. Bundlers replace this expression at build
// time, letting production builds tree-shake the dev-only devtools path.
// The index signature mirrors Node's real `ProcessEnv` shape so other env vars
// (e.g. the bench harness's RUN_BENCH_SENSITIVITY / BENCH_WEIGHT) type-check too.
declare const process: {
  env: { NODE_ENV?: string; [key: string]: string | undefined };
};
