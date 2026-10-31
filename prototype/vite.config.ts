import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devAuthPlugin } from "./dev/dev-auth.ts";

// Local Pages Functions worker (`npm run dev:pages`) that this dev server proxies
// /api to, so `npm run dev` gets hot reload against a real database.
const API_ORIGIN = "http://127.0.0.1:8788";
const proxy = { "/api": { target: API_ORIGIN, changeOrigin: true } };

export default defineConfig({
  plugins: [react(), tailwindcss(), devAuthPlugin()],
  server: { proxy },
  preview: { proxy },
  test: {
    // Acceptance tests boot an in-process Postgres (PGlite) and apply the real
    // migrations before each test, so they need more than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
