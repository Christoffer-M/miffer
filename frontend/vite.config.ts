import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Tells sw.js which files this build has, so it can keep them for opening offline. The version
 * changes whenever any of them does, which makes phones install the new worker and its files.
 */
function offlineFiles(): Plugin {
  return {
    name: "offline-files",
    apply: "build",
    writeBundle({ dir = "dist" }) {
      const files = readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => join(f.parentPath, f.name).slice(dir.length).replaceAll("\\", "/"))
        .filter((f) => f !== "/sw.js" && !f.startsWith("/."))
        .sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(dir, f)));
      const app = { version: hash.digest("hex").slice(0, 12), files };
      const sw = join(dir, "sw.js");
      const before = readFileSync(sw, "utf8");
      const after = before.replace(`const APP = { version: "", files: [] };`, `const APP = ${JSON.stringify(app)};`);
      if (after === before) throw new Error("sw.js has no APP to fill in");
      writeFileSync(sw, after);
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      // Lets each route keep its styles next to it (groceries.tsx + groceries.module.css).
      routeFileIgnorePattern: "\\.module\\.css$",
    }),
    react(),
    offlineFiles(),
  ],
  // Same paths as production, where nginx-proxy sends /api to the backend.
  server: { proxy: { "/api": { target: "http://localhost:3000", ws: true } } },
});
