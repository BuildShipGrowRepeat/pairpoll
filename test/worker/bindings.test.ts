import { env } from "cloudflare:workers";
import { expect, test } from "vitest";

test("D1 has the product schema", async () => {
  const tables = await env.DB.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('accounts', 'polls', 'runs', 'items')
    ORDER BY name
  `).all<{ name: string }>();
  expect(tables.results.map((row) => row.name)).toEqual(["accounts", "items", "polls", "runs"]);
});

test("R2 stores and returns an object", async () => {
  await env.MEDIA.put("probe.txt", "hello");
  const object = await env.MEDIA.get("probe.txt");
  expect(await object?.text()).toBe("hello");
});
