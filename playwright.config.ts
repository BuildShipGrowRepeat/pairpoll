import { defineConfig } from "@playwright/test";

const port = 4321;
// Fresh local D1/R2 state per run, so the real rate limits never carry over. `npm run dev` keeps using .wrangler/state.
const stateDir = ".wrangler/e2e-state";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: {
      // Reuses the headless Chromium already on Vladimir's Mac (revision 1243; Playwright 1.65 ships 1255).
      // On another machine, remove this line and run `npx playwright install chromium`.
      executablePath:
        "/Users/vladimir/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
    },
  },
  webServer: {
    // --ignore-lock keeps Astro in the foreground: Astro 7 backgrounds `astro dev` when it detects an AI agent.
    command: `rm -rf ${stateDir} && npx wrangler d1 migrations apply DB --local --persist-to ${stateDir} && npx astro dev --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/api/v1/health`,
    env: { E2E_STATE_DIR: stateDir },
    reuseExistingServer: false,
  },
});
