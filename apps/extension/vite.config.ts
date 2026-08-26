import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.config.js";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@intelligent-inbox/contracts": resolve(__dirname, "../../packages/contracts/src/index.ts")
    }
  },
  build: { sourcemap: true }
});
