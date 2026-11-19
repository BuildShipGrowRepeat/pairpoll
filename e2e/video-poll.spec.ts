import { expect, test } from "@playwright/test";
import { createAndOpen, signIn, startVoting } from "./helpers";

test("plays-once videos: voting unlocks only after both play, and a reload keeps that", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { link } = await createAndOpen(page, "Which cut keeps you watching?", ["video-a.webm", "video-b.webm", "video-c.webm"]);

  const voter = await startVoting(browser, link, "Ana");
  const picks = voter.getByRole("button", { name: /^Pick video/ });
  const played = voter.locator(".tile-seal:not([hidden])");
  await expect(picks).toHaveCount(0);

  await voter.locator(".tile-cover").nth(0).click();
  await expect(played).toHaveCount(1, { timeout: 15_000 });
  await expect(picks).toHaveCount(0);

  // Reloading neither resets the played video nor unlocks voting.
  await voter.reload();
  await expect(voter.locator(".vote-count")).toBeVisible({ timeout: 15_000 });
  await expect(played).toHaveCount(1);
  await expect(voter.locator(".tile-cover:not([hidden])")).toHaveCount(1);
  await expect(picks).toHaveCount(0);

  await voter.locator(".tile-cover:not([hidden])").click();
  await expect(picks).toHaveCount(2, { timeout: 15_000 });
  await picks.first().click();

  const done = voter.getByRole("heading", { name: "Your top 3" });
  for (let pairs = 0; pairs < 6 && !(await done.isVisible()); pairs++) {
    await expect(done.or(voter.locator(".tile-cover:not([hidden])").first())).toBeVisible({ timeout: 15_000 });
    if (await done.isVisible()) break;
    while (await voter.locator(".tile-cover:not([hidden])").count()) {
      await voter.locator(".tile-cover:not([hidden])").first().click();
      await expect(voter.locator(".duel-card.is-playing")).toHaveCount(0, { timeout: 15_000 });
    }
    await expect(picks).toHaveCount(2, { timeout: 15_000 });
    await picks.first().click();
  }
  await expect(done).toBeVisible();
});
