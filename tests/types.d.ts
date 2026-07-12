// Node globals the tests need, declared here rather than pulled from @types/node —
// same reasoning as bench/types.d.ts. Scoping them to the tests project
// (tests/tsconfig.json) is what keeps `process.on` out of the `src` program:
// src/env.d.ts shims `process.env` and nothing else, so browser source that reaches
// for a Node-only API fails to type-check instead of shipping.
declare const process: {
  env: { NODE_ENV?: string; [key: string]: string | undefined };
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};
