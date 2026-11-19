import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { runCleanup } from "../../src/server/cleanup";
import { duplicatePoll, uploadItem, uploadPoster } from "../../src/server/media";
import { DAILY_UPLOAD_LIMIT, utcDay } from "../../src/server/polls";
import { NOW, PNG, account, clearData, expectCode, poll, readyItem } from "./support";

beforeEach(clearData);

function uploadRequest(bytes: Uint8Array, declared = bytes.byteLength) {
  return new Request("https://pairpoll.test/upload", {
    method: "POST",
    headers: { "Content-Length": String(declared) },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });
}

function streamedUpload(chunks: Uint8Array[], declared: number) {
  return new Request("https://pairpoll.test/upload", {
    method: "POST",
    headers: { "Content-Length": String(declared) },
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  });
}

function bucketWith(overrides: Partial<Pick<R2Bucket, "put" | "delete">>): R2Bucket {
  return new Proxy(env.MEDIA, {
    get(target, property) {
      const override = overrides[property as keyof typeof overrides];
      if (override) return override;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const validPrefix = new Uint8Array(512);
validPrefix.set(PNG);

test.each([
  ["shorter", new Uint8Array(7)],
  ["longer", new Uint8Array(9)],
])("a stream %s than Content-Length is rejected after reservation and leaves no stored file", async (_name, tail) => {
  const owner = await account("stream@example.com");
  const created = await poll(owner);
  await expectCode(uploadItem(env.DB, env.MEDIA, owner, created.id, streamedUpload([validPrefix, tail], 520), NOW),
    "upload_size_mismatch");
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM items").first<number>("count")).toBe(0);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM uploads").first<number>("count")).toBe(0);
  expect((await env.MEDIA.list()).objects).toHaveLength(0);
});

test("concurrent daily-cap reservations allow only the upload that fits", async () => {
  const owner = await account("cap@example.com");
  const first = await poll(owner);
  const second = await poll(owner);
  await env.DB.prepare(`
    UPDATE usage SET uploaded_bytes = ? WHERE account_id = ? AND day = ?
  `).bind(DAILY_UPLOAD_LIMIT - PNG.byteLength, owner, utcDay(NOW)).run();

  const results = await Promise.allSettled([
    uploadItem(env.DB, env.MEDIA, owner, first.id, uploadRequest(PNG), NOW),
    uploadItem(env.DB, env.MEDIA, owner, second.id, uploadRequest(PNG), NOW),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected" &&
    (result.reason as { code?: string }).code === "upload_limit")).toHaveLength(1);
  expect(await env.DB.prepare("SELECT uploaded_bytes FROM usage WHERE account_id = ? AND day = ?")
    .bind(owner, utcDay(NOW)).first<number>("uploaded_bytes")).toBe(DAILY_UPLOAD_LIMIT);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM items WHERE status = 'ready'")
    .first<number>("count")).toBe(1);
  expect((await env.MEDIA.list()).objects).toHaveLength(1);
});

test("a failed poster write removes its reservation and keeps the item unchanged", async () => {
  const owner = await account("poster@example.com");
  const created = await poll(owner, { kind: "video" });
  const item = await readyItem(created.id, 0, { mime: "video/mp4" });
  const failing = bucketWith({
    put: async () => { throw new Error("R2 unavailable"); },
  });

  await expectCode(uploadPoster(env.DB, failing, owner, created.id, item.id, uploadRequest(PNG), NOW),
    "media_save_failed");
  expect(await env.DB.prepare("SELECT poster_key FROM items WHERE id = ?").bind(item.id)
    .first<string | null>("poster_key")).toBeNull();
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM uploads").first<number>("count")).toBe(0);
  expect((await env.MEDIA.list()).objects.map((object) => object.key)).toEqual([item.key]);
});

test("a failed duplicate removes staged copies and does not publish a poll", async () => {
  const owner = await account("duplicate@example.com");
  const source = await poll(owner);
  const first = await readyItem(source.id, 0);
  const missing = await readyItem(source.id, 1);
  await env.MEDIA.delete(missing.key);

  await expectCode(duplicatePoll(env.DB, env.MEDIA, owner, source.id, NOW), "media_missing");
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM polls WHERE owner_id = ?").bind(owner)
    .first<number>("count")).toBe(1);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM uploads").first<number>("count")).toBe(0);
  expect((await env.MEDIA.list()).objects.map((object) => object.key)).toEqual([first.key]);
});

test("cleanup keeps object references when R2 deletion fails and removes everything on retry", async () => {
  const owner = await account("cleanup-retry@example.com");
  const created = await poll(owner, { kind: "video" });
  const item = await readyItem(created.id, 0, { mime: "video/mp4", poster: PNG });
  await env.DB.prepare("UPDATE polls SET expires_at = ? WHERE id = ?").bind(NOW - 1, created.id).run();
  const failing = bucketWith({
    delete: async () => { throw new Error("R2 unavailable"); },
  });

  await expect(runCleanup(env.DB, failing, NOW)).rejects.toThrow("R2 unavailable");
  expect(await env.DB.prepare("SELECT object_key, poster_key FROM items WHERE id = ?").bind(item.id).first())
    .toEqual({ object_key: item.key, poster_key: item.posterKey });
  expect(await env.MEDIA.head(item.key)).not.toBeNull();
  expect(await env.MEDIA.head(item.posterKey!)).not.toBeNull();

  await runCleanup(env.DB, env.MEDIA, NOW);
  expect(await env.DB.prepare("SELECT id FROM polls WHERE id = ?").bind(created.id).first()).toBeNull();
  expect(await env.MEDIA.head(item.key)).toBeNull();
  expect(await env.MEDIA.head(item.posterKey!)).toBeNull();
});
