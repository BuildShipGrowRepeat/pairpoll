import { expect, test } from "@playwright/test";
import { createAndOpen, signIn, startVoting } from "./helpers";

test("a creator runs an image poll and two voters rank it", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { link, results } = await createAndOpen(page, "Which thumbnail would you click?", [
    "image-a.png",
    "image-b.png",
    "image-c.png",
    "image-d.png",
  ]);

  for (const [name, side] of [["Ana", 0], ["Ben", 1]] as const) {
    const voter = await startVoting(browser, link, name);
    const done = voter.getByRole("heading", { name: "Your top 3" });
    for (let pairs = 0; pairs < 10 && !(await done.isVisible()); pairs++) {
      const count = await voter.locator(".vote-count").textContent();
      await voter.locator(".duel-hit").nth(side).click();
      await expect(done.or(voter.locator(".vote-count").filter({ hasNotText: count! }))).toBeVisible();
    }
    await expect(done).toBeVisible();
    await expect(voter.locator(".top-list > li")).toHaveCount(3);

    // A reload shows the finished list again instead of a new run.
    await voter.reload();
    await expect(done).toBeVisible();
    await voter.context().close();
  }

  await page.goto(results);
  await expect(page.locator("[data-meta]")).toContainText("2 finished");
  await expect(page.locator(".rank > li")).toHaveCount(4);
  await expect(page.locator(".voter-name")).toHaveText(["Ana", "Ben"]);
});
