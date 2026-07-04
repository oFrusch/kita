import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/bench-sensitivity.test.ts", "**/node_modules/**"],
    globals: false,
  },
});
