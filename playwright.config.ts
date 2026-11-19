import { defineConfig } from "@playwright/test";

const port = 4321;

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
    command: `npm run db:migrate:local && npx astro dev --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/api/v1/health`,
    reuseExistingServer: false,
  },
});
