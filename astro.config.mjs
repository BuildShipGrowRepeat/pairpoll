// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://pairpoll.com",
  // Clean URLs without a trailing slash (/about, not /about/), matching the canonical tags.
  trailingSlash: "never",
  build: { format: "file" },
  // "compile" optimises images at build time and avoids the paid Cloudflare Images binding.
  adapter: cloudflare({ imageService: "compile" }),
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
