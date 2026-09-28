// Hybrid-style output. Astro 7 consolidated `output: "hybrid"` into
// `output: "static"` (the default): static pages render at build time and
// server routes (`export const prerender = false` on /api/contact) run on
// demand. The node adapter provides the local server for `astro dev`,
// `astro build` and `astro preview`; swap it for a host-specific adapter
// (@astrojs/vercel, @astrojs/cloudflare, …) at deploy time.
import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "static",
  adapter: node({ mode: "standalone" }),
});