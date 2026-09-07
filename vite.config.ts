import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// One version number for the whole project: the sidebar reads it from here
// rather than carrying a literal that drifts at the next release.
const { version } = JSON.parse(readFileSync("./package.json", "utf8"));

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },

  // Deux pages : l'application, et la petite fenetre de demarrage qui parait
  // pendant que la premiere se prepare. Sans cette liste, seul index.html
  // arriverait dans dist et la fenetre de demarrage afficherait un 404 dans
  // la version installee — jamais en developpement, ou Vite sert la racine.
  build: {
    rollupOptions: {
      input: { main: "index.html", splash: "splash.html" },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
