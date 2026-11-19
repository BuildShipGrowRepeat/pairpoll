import { env } from "cloudflare:workers";
import { expect, test } from "vitest";

test("D1 has the migrated schema", async () => {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'schema'").first<{ value: string }>();
  expect(row?.value).toBe("scaffold");
});

test("R2 stores and returns an object", async () => {
  await env.MEDIA.put("probe.txt", "hello");
  const object = await env.MEDIA.get("probe.txt");
  expect(await object?.text()).toBe("hello");
});
