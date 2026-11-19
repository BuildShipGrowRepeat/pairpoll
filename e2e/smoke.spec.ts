import { expect, test } from "@playwright/test";

test("home and app pages render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Images and videos, ranked head to head");
  await page.goto("/app");
  await expect(page.locator("#schema")).toHaveText("scaffold");
});
