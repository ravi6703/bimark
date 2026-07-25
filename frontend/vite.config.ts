import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Output straight into the deployed app's static dir so the dashboard is
// served from the same Vercel deployment as the API (same-origin, no CORS).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
