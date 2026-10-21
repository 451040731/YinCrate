import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 700 },
  server: { port: 5173, strictPort: true },
});
