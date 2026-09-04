import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    globals: true,
    environment: "node",
    server: {
      deps: {
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/server": path.resolve(__dirname, "./node_modules/next/server.js"),
    },
  },
});
