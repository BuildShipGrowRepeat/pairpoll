import { handle } from "@astrojs/cloudflare/handler";
import { runCleanup } from "./server/cleanup.js";
import {
  handleOAuthRequest,
  revokePendingOAuthAccounts,
  revokePendingOAuthGrants,
} from "./server/oauth.js";
import { serveSiteVideo } from "./server/site-video.js";

const astro: ExportedHandler<Env> = { fetch: handle };

export default {
  fetch(request, env, context) {
    if (new URL(request.url).pathname.startsWith("/videos/")) return serveSiteVideo(request, env.ASSETS);
    return handleOAuthRequest(request, env, context, astro);
  },
  async scheduled(_controller, env) {
    try {
      await revokePendingOAuthAccounts(env, "https://pairpoll.com");
      await revokePendingOAuthGrants(env, "https://pairpoll.com");
    } catch (error) {
      console.error("OAuth grant KV cleanup will be retried", error);
    }
    await runCleanup(env.DB, env.MEDIA);
  },
} satisfies ExportedHandler<Env>;
