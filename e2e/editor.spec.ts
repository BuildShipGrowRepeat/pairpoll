import { expect, test, type Page } from "@playwright/test";
import { fixture, signIn } from "./helpers";

const pollId = (page: Page) => new URL(page.url()).pathname.split("/").pop()!;

async function openPoll(page: Page) {
  await page.getByRole("button", { name: "Open poll" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open poll" }).click();
}

test("opening saves a setting whose autosave failed, or stops", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.goto("/app/new");
  await page.getByLabel("Question").fill("Which one?");
  await page.locator("[data-file-input]").setInputFiles([fixture("image-a.png"), fixture("image-b.png")]);
  await expect(page.getByRole("button", { name: "Open poll" })).toBeEnabled({ timeout: 30_000 });

  // Every settings save fails while this route is in place.
  const failSaves = (route: import("@playwright/test").Route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Try again." } } })
      : route.fallback();
  await page.route("**/api/v1/polls/*", failSaves);
  await page.getByLabel("Maximum voters").fill("7");
  await page.getByLabel("Maximum voters").blur();
  await expect(page.locator("[data-save-state]")).toContainText("Not saved");

  await openPoll(page);
  await expect(page.locator("[data-editor-error]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your poll is open" })).toBeHidden();
  expect((await (await page.request.get(`/api/v1/polls/${pollId(page)}`)).json()).status).toBe("draft");

  await page.unroute("**/api/v1/polls/*", failSaves);
  await openPoll(page);
  await expect(page.getByRole("heading", { name: "Your poll is open" })).toBeVisible();
  const poll = await (await page.request.get(`/api/v1/polls/${pollId(page)}`)).json();
  expect(poll).toMatchObject({ status: "open", voterCap: 7 });
});

test("a file cancelled while the draft is being created stays out of the poll", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.goto("/app/new");
  await page.getByLabel("Question").fill("Which one?");

  // Hold the draft creation until the first upload has been cancelled.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/v1/polls", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.fallback();
  });
  await page.locator("[data-file-input]").setInputFiles(["image-a.png", "image-b.png", "image-c.png"].map(fixture));
  await page.getByRole("button", { name: "Cancel upload: image-a.png" }).click();
  await expect(page.locator(".item-row")).toHaveCount(2);
  release();

  await expect(page.getByRole("button", { name: "Open poll" })).toBeEnabled({ timeout: 30_000 });
  await openPoll(page);
  await expect(page.getByRole("heading", { name: "Your poll is open" })).toBeVisible();
  const poll = await (await page.request.get(`/api/v1/polls/${pollId(page)}`)).json();
  expect(poll.items.map((item: { label: string }) => item.label).sort()).toEqual(["image-b.png", "image-c.png"]);
});
