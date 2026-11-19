// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://pairpoll.com",
  // "compile" optimises images at build time and avoids the paid Cloudflare Images binding.
  adapter: cloudflare({ imageService: "compile" }),
  // Without this the adapter adds a KV binding for Astro sessions; we keep state in D1.
  session: false,
});
