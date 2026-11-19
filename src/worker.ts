import { handle } from "@astrojs/cloudflare/handler";

export default {
  fetch: handle,
  async scheduled() {
    // The 30-day cleanup (D1 rows and R2 files) goes here; the backend builder writes it.
  },
} satisfies ExportedHandler<Env>;
