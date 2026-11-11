import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis" },
  optimizeDeps: { include: ["@primuslabs/network-js-sdk", "ethers"] },
  build: { target: "es2022" },
  server: { proxy: { "/api": "http://localhost:8787" } }
});
