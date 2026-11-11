import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app can be served under a subpath (e.g. https://apps.example.com/cart-blanche/). The base is baked in at
// build time: VITE_BASE=/cart-blanche/ pnpm build. Defaults to "/" for local development.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      [`${base}api`]: {
        target: process.env.API_URL ?? "http://localhost:8787",
        rewrite: (p) => p.slice(base.length - 1),
      },
    },
  },
});
