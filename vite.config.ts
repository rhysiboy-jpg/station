/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the build works under /station/ on GitHub Pages.
  base: "./",
  test: {
    include: ["src/**/*.test.ts"],
  },
});
