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
    // The e2e server has a test GA ID, so the consent pop-up would cover every page; answer it up front.
    // e2e/consent.spec.ts starts without this to test the pop-up itself.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: "pairpoll-analytics", value: "rejected" }] }],
    },
  },
  webServer: {
    // --ignore-lock keeps Astro in the foreground: Astro 7 backgrounds `astro dev` when it detects an AI agent.
    command: `rm -rf ${stateDir} && npx wrangler d1 migrations apply DB --local --persist-to ${stateDir} && npx astro dev --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/api/v1/health`,
    env: { E2E_STATE_DIR: stateDir, PUBLIC_GA_ID: "G-TEST000000" },
    reuseExistingServer: false,
  },
});
