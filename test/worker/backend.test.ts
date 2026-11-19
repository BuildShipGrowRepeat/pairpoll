import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { authenticate, authenticateSession, consumeSignInLink, generateKey } from "../../src/server/auth";
import { runCleanup } from "../../src/server/cleanup";
import { ServerError } from "../../src/server/errors";
import { serveMedia, uploadItem } from "../../src/server/media";
import { closePoll, createPoll, deletePoll, getPoll, openPoll, updatePoll } from "../../src/server/polls";
import { joinPoll, newVoterToken, recordVoterEvent } from "../../src/server/runs";
import { hashToken } from "../../src/server/security";

const NOW = Date.now();

async function clearData() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM runs"),
    env.DB.prepare("DELETE FROM uploads"),
    env.DB.prepare("DELETE FROM items"),
    env.DB.prepare("DELETE FROM polls"),
    env.DB.prepare("DELETE FROM dev_mail"),
    env.DB.prepare("DELETE FROM device_requests"),
    env.DB.prepare("DELETE FROM credentials"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM usage"),
    env.DB.prepare("DELETE FROM accounts"),
  ]);
  const objects = await env.MEDIA.list();
  if (objects.objects.length) await env.MEDIA.delete(objects.objects.map((object) => object.key));
}

beforeEach(clearData);

async function account(email: string) {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
    .bind(id, email, NOW).run();
  return id;
}

async function poll(ownerId: string, input: Partial<{
  kind: "image" | "video";
  question: string;
  topSize: 1 | 3 | 5;
  playsOnce: boolean;
  voterCap: number;
}> = {}) {
  return createPoll(env.DB, ownerId, {
    kind: "image", question: "Which is better?", topSize: 3, playsOnce: false, voterCap: 50, ...input,
  }, NOW);
}

async function readyItem(pollId: string, position: number, bytes = new Uint8Array([1, 2, 3, 4])) {
  const id = crypto.randomUUID();
  const key = crypto.randomUUID();
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
  await env.DB.prepare(`
    INSERT INTO items (id, poll_id, position, label, object_key, bytes, mime, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'image/png', 'ready', ?)
  `).bind(id, pollId, position, `Item ${position + 1}`, key, bytes.byteLength, NOW).run();
  return { id, key, bytes };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject<Partial<ServerError>>({ code });
}

test("ownership is enforced and API keys cannot use session-only key management", async () => {
  const owner = await account("owner@example.com");
  const other = await account("other@example.com");
  const created = await poll(owner);
  await expectCode(getPoll(env.DB, other, created.id, NOW), "poll_not_found");
  await expectCode(updatePoll(env.DB, other, created.id, { question: "Changed" }, NOW), "poll_not_found");

  const key = generateKey();
  await env.DB.prepare(`
    INSERT INTO credentials (id, account_id, kind, hash, name, created_at)
    VALUES (?, ?, 'api_key', ?, 'test', ?)
  `).bind(crypto.randomUUID(), owner, await hashToken(key), NOW).run();
  const request = new Request("https://pairpoll.test/api/v1/keys", {
    headers: { Authorization: `Bearer ${key}` },
  });
  expect((await authenticate(env.DB, request))?.kind).toBe("api_key");
  expect(await authenticateSession(env.DB, request)).toBeNull();
});

test("sign-in links are consumed once even under concurrent requests", async () => {
  const accountId = await account("once@example.com");
  const token = "a".repeat(64);
  await env.DB.prepare(`
    INSERT INTO credentials (id, account_id, kind, hash, created_at, expires_at)
    VALUES (?, ?, 'link', ?, ?, ?)
  `).bind(crypto.randomUUID(), accountId, await hashToken(token), NOW, NOW + 60_000).run();
  const results = await Promise.all([consumeSignInLink(env.DB, token), consumeSignInLink(env.DB, token)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM credentials WHERE kind = 'session'")
    .first<number>("count")).toBe(1);
});

test("opening freezes settings and items and closing is final", async () => {
  const owner = await account("lifecycle@example.com");
  const created = await poll(owner);
  await readyItem(created.id, 0);
  await readyItem(created.id, 1);
  expect((await openPoll(env.DB, owner, created.id, NOW)).status).toBe("open");
  await expectCode(updatePoll(env.DB, owner, created.id, { question: "Too late" }, NOW), "poll_frozen");
  expect((await closePoll(env.DB, owner, created.id, NOW)).status).toBe("closed");
  await expectCode(openPoll(env.DB, owner, created.id, NOW), "poll_closed");
});

test("concurrent joins cannot exceed the voter cap", async () => {
  const owner = await account("cap@example.com");
  const created = await poll(owner, { voterCap: 1 });
  await readyItem(created.id, 0);
  await readyItem(created.id, 1);
  await openPoll(env.DB, owner, created.id, NOW);
  const joins = await Promise.allSettled([
    joinPoll(env.DB, created.code, "First", newVoterToken(), NOW),
    joinPoll(env.DB, created.code, "Second", newVoterToken(), NOW),
  ]);
  expect(joins.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(joins.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect(await env.DB.prepare("SELECT admitted_count FROM polls WHERE id = ?").bind(created.id)
    .first<number>("admitted_count")).toBe(1);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE poll_id = ?").bind(created.id)
    .first<number>("count")).toBe(1);
});

test("a stale vote returns the current revision without changing the result", async () => {
  const owner = await account("revision@example.com");
  const created = await poll(owner, { topSize: 1 });
  await readyItem(created.id, 0);
  await readyItem(created.id, 1);
  await openPoll(env.DB, owner, created.id, NOW);
  const token = newVoterToken();
  const initial = await joinPoll(env.DB, created.code, "Voter", token, NOW);
  const event = { type: "vote" as const, revision: initial.revision, index: initial.index, winner: initial.pair![0] };
  const finished = await recordVoterEvent(env.DB, created.code, token, event, NOW);
  expect(finished.ranking).toEqual([event.winner]);
  await expect(recordVoterEvent(env.DB, created.code, token, event, NOW)).rejects.toMatchObject({
    code: "voter_state_conflict",
    details: expect.objectContaining({ revision: 1, ranking: [event.winner] }),
  });
  expect(await env.DB.prepare("SELECT revision FROM runs WHERE poll_id = ?").bind(created.id)
    .first<number>("revision")).toBe(1);
});

test("uploads reject oversized and unknown file types without storing data", async () => {
  const owner = await account("upload@example.com");
  const created = await poll(owner);
  const unknown = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  await expectCode(uploadItem(env.DB, env.MEDIA, owner, created.id, new Request("https://pairpoll.test/upload", {
    method: "POST", headers: { "Content-Length": String(unknown.byteLength) }, body: unknown,
  }), NOW), "unsupported_media");
  await expectCode(uploadItem(env.DB, env.MEDIA, owner, created.id, new Request("https://pairpoll.test/upload", {
    method: "POST", headers: { "Content-Length": "10000001" }, body: new Uint8Array([0x89]),
  }), NOW), "upload_too_large");
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM items").first<number>("count")).toBe(0);
  expect((await env.MEDIA.list()).objects).toHaveLength(0);
});

test("an upload cannot publish after its poll expires", async () => {
  const owner = await account("expiry-upload@example.com");
  const created = await poll(owner);
  const expiredAt = Date.now() - 1;
  await env.DB.prepare("UPDATE polls SET expires_at = ? WHERE id = ?").bind(expiredAt, created.id).run();
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await expectCode(uploadItem(env.DB, env.MEDIA, owner, created.id, new Request("https://pairpoll.test/upload", {
    method: "POST", headers: { "Content-Length": String(pngHeader.byteLength) }, body: pngHeader,
  }), expiredAt - 1), "poll_changed");
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM items").first<number>("count")).toBe(0);
  expect((await env.MEDIA.list()).objects).toHaveLength(0);
  await expectCode(deletePoll(env.DB, owner, created.id), "poll_not_found");
});

test("media supports HEAD and one byte range and denies expired polls", async () => {
  const owner = await account("media@example.com");
  const created = await poll(owner);
  const item = await readyItem(created.id, 0, new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
  await readyItem(created.id, 1);
  await openPoll(env.DB, owner, created.id, NOW);
  const ranged = await serveMedia(env.DB, env.MEDIA, new Request("https://pairpoll.test/media", {
    headers: { Range: "bytes=2-5" },
  }), item.key, null, NOW);
  expect(ranged.status).toBe(206);
  expect(ranged.headers.get("Content-Range")).toBe("bytes 2-5/8");
  expect([...new Uint8Array(await ranged.arrayBuffer())]).toEqual([2, 3, 4, 5]);
  const head = await serveMedia(env.DB, env.MEDIA, new Request("https://pairpoll.test/media", {
    method: "HEAD",
  }), item.key, null, NOW);
  expect(head.status).toBe(200);
  expect(head.headers.get("Content-Length")).toBe("8");
  expect(head.headers.get("X-Content-Type-Options")).toBe("nosniff");
  const several = await serveMedia(env.DB, env.MEDIA, new Request("https://pairpoll.test/media", {
    headers: { Range: "bytes=0-1,3-4" },
  }), item.key, null, NOW);
  expect(several.status).toBe(200);
  expect(several.headers.get("Content-Length")).toBe("8");
  expect([...new Uint8Array(await several.arrayBuffer())]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  const outside = await serveMedia(env.DB, env.MEDIA, new Request("https://pairpoll.test/media", {
    headers: { Range: "bytes=8-" },
  }), item.key, null, NOW);
  expect(outside.status).toBe(416);
  expect(outside.headers.get("Content-Range")).toBe("bytes */8");
  const expired = await serveMedia(env.DB, env.MEDIA, new Request("https://pairpoll.test/media"),
    item.key, null, NOW + 31 * 24 * 60 * 60 * 1000);
  expect(expired.status).toBe(404);
});

test("cleanup removes expired media, abandoned uploads and stale credentials", async () => {
  const old = NOW - 31 * 24 * 60 * 60 * 1000;
  const owner = await account("cleanup@example.com");
  const created = await poll(owner);
  const item = await readyItem(created.id, 0);
  await env.DB.prepare("UPDATE polls SET expires_at = ? WHERE id = ?").bind(old, created.id).run();
  const abandoned = crypto.randomUUID();
  await env.MEDIA.put(abandoned, "unfinished");
  await env.DB.prepare("INSERT INTO uploads (object_key, poll_id, item_id, created_at) VALUES (?, ?, ?, ?)")
    .bind(abandoned, created.id, crypto.randomUUID(), old).run();
  await env.DB.prepare(`
    INSERT INTO credentials (id, account_id, kind, hash, created_at, expires_at)
    VALUES (?, ?, 'session', ?, ?, ?)
  `).bind(crypto.randomUUID(), owner, await hashToken("stale"), old, old).run();
  await runCleanup(env.DB, env.MEDIA, NOW);
  expect(await env.MEDIA.head(item.key)).toBeNull();
  expect(await env.MEDIA.head(abandoned)).toBeNull();
  expect(await env.DB.prepare("SELECT id FROM polls WHERE id = ?").bind(created.id).first()).toBeNull();
  expect(await env.DB.prepare("SELECT id FROM credentials WHERE account_id = ?").bind(owner).first()).toBeNull();
});
