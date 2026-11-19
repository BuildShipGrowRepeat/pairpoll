import { handle } from "@astrojs/cloudflare/handler";
import { runCleanup } from "./server/cleanup.js";

export default {
  fetch: handle,
  async scheduled(_controller, env) {
    await runCleanup(env.DB, env.MEDIA);
  },
} satisfies ExportedHandler<Env>;
