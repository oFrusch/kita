/**
 * size-limit config. Measures kita's own shipped code, gzipped/brotlied, with
 * the `vue` / `@vue/devtools-api` peer deps excluded (consumers already have
 * them, and the devtools API is a dev-only dynamic import — see
 * `src/devtools/index.ts`).
 *
 * Run `pnpm size` after `pnpm build`.
 */
const ignore = ["vue", "@vue/devtools-api"];

export default [
  {
    name: "ESM — full public surface",
    path: "dist/index.js",
    import: "*",
    ignore,
  },
  {
    name: "ESM — quick-start import",
    path: "dist/index.js",
    import:
      "{ ApplicationStore, createAndRegisterStore, AsyncModel, AsyncStore, registerModel, reactive }",
    ignore,
  },
];
