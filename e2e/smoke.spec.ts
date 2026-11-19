import { expect, test } from "@playwright/test";

test("home renders and the app asks for sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A poll for images and videos, ranked head to head");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/signin\?next=%2Fapp|\/signin\?next=\/app/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("pages rendered on request are not cached or framed", async ({ request }) => {
  const response = await request.get("/signin");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
});
