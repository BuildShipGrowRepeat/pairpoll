import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { ALL } from "../../src/pages/api/v1/[...path]";
import { generateKey, type SessionAuth } from "../../src/server/auth";
import { ServerError } from "../../src/server/errors";
import { createPoll, openPoll, type PollKind } from "../../src/server/polls";
import { getVoterState, joinPoll, newVoterToken, recordVoterEvent } from "../../src/server/runs";
import { hashToken } from "../../src/server/security";

export const NOW = Date.now();
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function clearData() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_consent_states"),
    env.DB.prepare("DELETE FROM oauth_grant_states"),
    env.DB.prepare("DELETE FROM oauth_account_cleanup"),
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

export async function account(email: string, options: { blocked?: boolean } = {}) {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO accounts (id, email, created_at, blocked_at) VALUES (?, ?, ?, ?)")
    .bind(id, email, NOW, options.blocked ? NOW : null).run();
  return id;
}

export async function credential(
  accountId: string,
  kind: "session" | "api_key",
  options: { expired?: boolean; revoked?: boolean; name?: string } = {},
) {
  const token = kind === "api_key" ? generateKey() : newVoterToken();
  const id = crypto.randomUUID();
  const expiresAt = kind === "session" ? (options.expired ? NOW - 1 : NOW + 60 * 60 * 1000) : null;
  await env.DB.prepare(`
    INSERT INTO credentials (id, account_id, kind, hash, name, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, accountId, kind, await hashToken(token), options.name ?? null, NOW, expiresAt,
    options.revoked ? NOW : null).run();
  return { id, token };
}

export function authHeaders(auth: { token: string }, origin = true): Record<string, string> {
  if (auth.token.startsWith("ppk_")) return { Authorization: `Bearer ${auth.token}` };
  const headers: Record<string, string> = { Cookie: `pp_session=${auth.token}` };
  if (origin) headers.Origin = "https://pairpoll.test";
  return headers;
}

export function sessionAuth(accountId: string, email: string, value: { id: string }): SessionAuth {
  return { accountId, email, credentialId: value.id, kind: "session" };
}

export async function poll(
  ownerId: string,
  input: Partial<{ kind: PollKind; question: string; topSize: 1 | 3 | 5; playsOnce: boolean; voterCap: number }> = {},
) {
  return createPoll(env.DB, ownerId, {
    kind: "image", question: "Which is better?", topSize: 3, playsOnce: false, voterCap: 50, ...input,
  }, NOW);
}

export async function readyItem(
  pollId: string,
  position: number,
  options: { bytes?: Uint8Array; label?: string; mime?: string; poster?: Uint8Array } = {},
) {
  const id = crypto.randomUUID();
  const key = crypto.randomUUID();
  const bytes = options.bytes ?? PNG;
  const mime = options.mime ?? "image/png";
  const posterKey = options.poster ? crypto.randomUUID() : null;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
  if (posterKey && options.poster) {
    await env.MEDIA.put(posterKey, options.poster, { httpMetadata: { contentType: "image/png" } });
  }
  await env.DB.prepare(`
    INSERT INTO items (id, poll_id, position, label, object_key, poster_key, bytes, mime,
      poster_bytes, poster_mime, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)
  `).bind(id, pollId, position, options.label ?? `Item ${position + 1}`, key, posterKey, bytes.byteLength, mime,
    options.poster?.byteLength ?? 0, options.poster ? "image/png" : null, NOW).run();
  return { id, key, posterKey, bytes };
}

export async function readyPoll(
  ownerId: string,
  options: Partial<{ kind: PollKind; topSize: 1 | 3 | 5; playsOnce: boolean; voterCap: number; items: number }> = {},
) {
  const created = await poll(ownerId, options);
  const items = [];
  for (let position = 0; position < (options.items ?? 2); position++) {
    items.push(await readyItem(created.id, position, {
      mime: options.kind === "video" ? "video/mp4" : "image/png",
    }));
  }
  await openPoll(env.DB, ownerId, created.id, NOW);
  return { ...created, items };
}

export async function call(path: string, request: Request) {
  if (typeof ALL !== "function") throw new Error("API handler is not callable");
  return ALL({ request, params: { path } } as never);
}

export async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject<Partial<ServerError>>({ code });
}

export async function databaseState() {
  const tables = [
    "accounts", "credentials", "device_requests", "oauth_account_cleanup", "oauth_consent_states",
    "oauth_grant_states",
    "polls", "items", "runs", "reports", "usage", "uploads",
  ];
  const rows = await Promise.all(tables.map(async (table) =>
    (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results));
  const objects = (await env.MEDIA.list()).objects.map(({ key, size }) => ({ key, size }));
  return { rows, objects };
}

export async function finishRun(code: string, name: string, winner: string, token = newVoterToken()) {
  let state = await joinPoll(env.DB, code, name, token, NOW);
  while (!state.ranking) {
    state = await recordVoterEvent(env.DB, code, token, {
      type: "vote", revision: state.revision, index: state.index,
      winner: state.pair!.includes(winner) ? winner : state.pair![0],
    }, NOW);
  }
  return { token, state: await getVoterState(env.DB, code, token, NOW) };
}
