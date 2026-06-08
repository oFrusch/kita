// Minimal ambient declaration so `process.env.NODE_ENV` type-checks without
// pulling in all of `@types/node`. Bundlers replace this expression at build
// time, letting production builds tree-shake the dev-only devtools path.
declare const process: { env: { NODE_ENV?: string } };
