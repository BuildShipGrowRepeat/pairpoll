/* global process */
// @ts-check
import { defineConfig, envField } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://pairpoll.com",
  // Clean URLs without a trailing slash (/about, not /about/), matching the canonical tags.
  trailingSlash: "never",
  build: { format: "file" },
  // "compile" optimises images at build time and avoids the paid Cloudflare Images binding.
  // E2E_STATE_DIR (set only by playwright.config.ts) points local D1/R2 state at a throwaway directory.
  adapter: cloudflare({
    imageService: "compile",
    ...(process.env.E2E_STATE_DIR && { persistState: { path: process.env.E2E_STATE_DIR } }),
  }),
  // Analytics IDs, set here and baked into the build. Empty turns that analytics off.
  // An environment variable of the same name overrides the default (the e2e server sets a test GA ID).
  env: {
    schema: {
      // Google Analytics 4 measurement ID ("G-..."), loaded only after the visitor accepts.
      PUBLIC_GA_ID: envField.string({ context: "client", access: "public", default: "" }),
      // Cloudflare Web Analytics site token, no cookies, on every page.
      PUBLIC_CF_BEACON_TOKEN: envField.string({ context: "client", access: "public", default: "21e84da553d04f3eac5d3a063435af7d" }),
    },
  },
  // Without this the adapter adds a KV binding for Astro sessions; we keep state in D1.
  session: false,
  integrations: [
    {
      // The component preview at /design exists in `astro dev` only, never in the build.
      name: "dev-design-preview",
      hooks: {
        "astro:config:setup": ({ command, injectRoute }) => {
          if (command === "dev") injectRoute({ pattern: "/design", entrypoint: "./src/dev/design.astro" });
        },
      },
    },
  ],
});
