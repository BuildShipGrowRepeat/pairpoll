import { expect, test } from "@playwright/test";

test("home renders and the app asks for sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Too many good options? Let people pick, two at a time.");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/signin\?next=%2Fapp|\/signin\?next=\/app/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the theme switch overrides the system theme and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme");
  await page.getByRole("button", { name: "Switch to the dark theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to the light theme" })).toBeVisible();
});

test("pages rendered on request are not cached or framed", async ({ request }) => {
  const response = await request.get("/signin");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
});
