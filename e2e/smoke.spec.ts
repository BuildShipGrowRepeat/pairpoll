import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("home renders and the app asks for sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Too many good options? Let people pick, two at a time.");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/signin\?next=%2Fapp|\/signin\?next=\/app/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the theme menu sets dark, keeps it after a reload and goes back to the system theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  const theme = page.getByRole("button", { name: "Theme", exact: true });
  await expect(html).not.toHaveAttribute("data-theme");
  await theme.click();
  await expect(page.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark" })).toBeHidden();
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await theme.click();
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  expect(await page.evaluate(() => localStorage.getItem("pairpoll-theme"))).toBeNull();
});

test("the app header links home and to the docs, and the app has the site footer", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("banner").getByRole("link", { name: "Pairpoll home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("pages rendered on request are not cached or framed", async ({ request }) => {
  const response = await request.get("/signin");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
});
