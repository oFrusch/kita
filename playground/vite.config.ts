import swc from "@rollup/plugin-swc";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
    // SWC handles Stage 3 decorators (esbuild doesn't yet).
    // Applied to .ts files only; .vue files go through @vitejs/plugin-vue.
    swc({
      include: /\.ts$/,
      swc: {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          target: "es2022",
          transform: { decoratorVersion: "2022-03" },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      // Point at the live source so edits to kita/src/ HMR into the playground.
      // No build step needed during development.
      "@ofrusch/kita": resolve(__dirname, "../src/index.ts"),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
});
