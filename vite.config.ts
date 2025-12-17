import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // Use relative paths for assets
  optimizeDeps: {
    include: ["@fluentui/react-components", "@fluentui/react-icons"],
    exclude: ["sql.js"], // sql.js ships ESM/wasm; avoid prebundling issues
  },
  assetsInclude: ["**/*.wasm"],
  build: {
    sourcemap: false,
    target: "es2020",
    outDir: "dist",
  },
});
