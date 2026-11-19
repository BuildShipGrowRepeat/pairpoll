import { expect, test } from "@playwright/test";

// The e2e server runs with PUBLIC_GA_ID=G-TEST000000. Start with no stored choice.
test.use({ storageState: { cookies: [], origins: [] } });

const gtag = /googletagmanager\.com\/gtag\/js/;

test.beforeEach(async ({ page }) => {
  // Never reach Google from a test.
  await page.route(gtag, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
});

test("the pop-up blocks the page until Accept, then loads GA and stays answered", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (gtag.test(request.url())) requested.push(request.url());
  });
  await page.goto("/about");
  const dialog = page.getByRole("dialog", { name: "Analytics cookies" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  // The page behind can't be clicked or scrolled while the pop-up is open.
  await expect(page.getByRole("link", { name: "Terms" }).click({ timeout: 1000 })).rejects.toThrow();
  await expect(page).toHaveURL(/\/about$/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  expect(requested).toHaveLength(0);

  await dialog.getByRole("button", { name: "Accept" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => requested.length).toBe(1);
  expect(requested[0]).toContain("id=G-TEST000000");

  await page.goto("/");
  await expect(page.locator("script[src*='googletagmanager.com/gtag/js']")).toHaveCount(1);
  await expect(dialog).toBeHidden();
});

test("Reject never loads GA, and Cookie settings asks again", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Analytics cookies" });
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/docs");
  await expect(dialog).toBeHidden();
  await expect(page.locator("script[src*='googletagmanager']")).toHaveCount(0);

  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(dialog).toBeVisible();
});

test("voter pages have no pop-up", async ({ page }) => {
  await page.goto("/p/nonexistent");
  await expect(page.getByRole("heading", { name: "This poll doesn't exist" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
