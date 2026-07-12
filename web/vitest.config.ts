import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // mirror tsconfig "@/*" → "./src/*" so tests import app code the same way
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
