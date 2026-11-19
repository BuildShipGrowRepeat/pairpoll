import { expect, type Browser, type Page } from "@playwright/test";

export const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

/** Signs in through the form, Turnstile test keys and the local dev mailbox. */
export async function signIn(page: Page) {
  const email = `maker-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-dev-link]").click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  return email;
}

/** Creates a poll from fixture files in the editor, opens it and returns its voting link and results path. */
export async function createAndOpen(page: Page, question: string, files: string[]) {
  await page.goto("/app/new");
  await page.getByLabel("Question").fill(question);
  await page.locator("[data-file-input]").setInputFiles(files.map(fixture));
  await expect(page.locator(".item-row")).toHaveCount(files.length);
  const open = page.getByRole("button", { name: "Open poll" });
  await expect(open).toBeEnabled({ timeout: 30_000 });
  await open.click();
  await page.getByRole("dialog").getByRole("button", { name: "Open poll" }).click();
  await expect(page.getByRole("heading", { name: "Your poll is open" })).toBeVisible();
  const link = await page.locator(".copy-input").inputValue();
  return { link, results: new URL(page.url()).pathname };
}

/** A voter in a fresh browser: enters a name and starts. */
export async function startVoting(browser: Browser, link: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "All clear, start" }).click();
  await expect(page.locator(".vote-count")).toBeVisible({ timeout: 30_000 });
  return page;
}
