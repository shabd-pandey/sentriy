import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Acceptance tests boot an in-process Postgres (PGlite) and apply the real
    // migrations before each test, so they need more than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
