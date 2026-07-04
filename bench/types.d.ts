// Ambient Node globals the bench `.ts` entrypoints need (process.argv/exit in
// run-case.ts, process.env in the cases). The repo deliberately avoids
// `@types/node` — see src/env.d.ts — so this mirrors that minimal-ambient
// approach for the bench program ONLY (loaded via bench/tsconfig.json). It is
// never in scope for the main `tsc` run (include: ["src","tests"]), so it does
// not collide with src's ambient `process` declaration.
declare const process: {
  argv: string[];
  exit(code?: number): never;
  env: { NODE_ENV?: string; [key: string]: string | undefined };
};
