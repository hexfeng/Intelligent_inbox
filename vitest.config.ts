import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@intelligent-inbox/contracts": resolve(__dirname, "packages/contracts/src/index.ts")
    }
  },
  test: {
    include: ["apps/**/*.test.ts", "apps/**/*.test.tsx", "packages/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
