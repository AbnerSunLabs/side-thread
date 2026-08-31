import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "core-weread": path.resolve(rootDir, "../src/core"),
    },
  },
  server: {
    cors: true,
    port: 5183,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
});
