import { handle } from "@astrojs/cloudflare/handler";
import { runCleanup } from "./server/cleanup.js";
import {
  handleOAuthRequest,
  revokePendingOAuthAccounts,
  revokePendingOAuthGrants,
} from "./server/oauth.js";

const astro: ExportedHandler<Env> = { fetch: handle };

export default {
  fetch(request, env, context) {
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
