import { defineConfig } from "@playwright/test";

const port = 4321;
// Fresh local D1/R2 state per run, so the real rate limits never carry over. `npm run dev` keeps using .wrangler/state.
const stateDir = ".wrangler/e2e-state";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: `http://localhost:${port}`,
    // Optional: reuse an already installed Chromium instead of running `npx playwright install chromium`.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
  },
  webServer: {
    // --ignore-lock keeps Astro in the foreground: Astro 7 backgrounds `astro dev` when it detects an AI agent.
    command: `rm -rf ${stateDir} && npx wrangler d1 migrations apply DB --local --persist-to ${stateDir} && npx astro dev --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/api/v1/health`,
    env: { E2E_STATE_DIR: stateDir },
    reuseExistingServer: false,
  },
});
