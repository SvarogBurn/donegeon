import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { SassString } from "sass";
import { defineConfig } from "vite";

const nesRoot = path.dirname(createRequire(import.meta.url).resolve("nes.css/package.json"));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    preprocessorOptions: {
      scss: {
        // NES.css is compiled from its Sass sources (src/styles/nes.scss), which
        // expect this helper from its own build: a file inlined as a data URI.
        // Its paths are relative to the package's scss/ folder.
        functions: {
          "get-file-as-data-uri($file)": ([file]: unknown[]) => {
            const png = readFileSync(path.resolve(nesRoot, "scss", (file as SassString).assertString("file").text));
            return new SassString(`data:image/png;base64,${png.toString("base64")}`, { quotes: false });
          },
        },
        // NES.css still uses Sass's older syntax; that is its business, not a problem in this app.
        quietDeps: true,
        silenceDeprecations: ["import", "global-builtin", "color-functions", "slash-div"],
      },
    },
  },
  server: {
    // The pixel-art borders and buttons live in the repo's top-level assets/ folder.
    fs: { allow: [".."] },
    // Same-origin in dev as in production, so the session cookie just works.
    proxy: { "/api": "http://localhost:3001" },
  },
});
