import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      // Lets each route keep its styles next to it (groceries.tsx + groceries.module.css).
      routeFileIgnorePattern: "\\.module\\.css$",
    }),
    react(),
  ],
  // Same paths as production, where nginx-proxy sends /api to the backend.
  server: { proxy: { "/api": { target: "http://localhost:3000", ws: true } } },
});
