import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin in dev as in production, so the session cookie just works.
    proxy: { "/api": "http://localhost:3001" },
  },
});
