import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/content/content.ts"),
      output: {
        entryFileNames: "content.js",
        assetFileNames: (assetInfo) =>
          assetInfo.name === "content.css" ? "content.css" : "assets/[name]-[hash][extname]",
        format: "iife",
      },
    },
  },
})
