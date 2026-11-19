import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { generateKey } from "../../src/server/auth";
import { handleMcpRequest } from "../../src/server/mcp/handler";
import { createPoll } from "../../src/server/polls";
import { hashToken } from "../../src/server/security";

const NOW = Date.now();

async function clearData() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_consent_states"),
    env.DB.prepare("DELETE FROM oauth_grant_states"),
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM runs"),
    env.DB.prepare("DELETE FROM uploads"),
    env.DB.prepare("DELETE FROM items"),
    env.DB.prepare("DELETE FROM polls"),
    env.DB.prepare("DELETE FROM device_requests"),
    env.DB.prepare("DELETE FROM credentials"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM usage"),
    env.DB.prepare("DELETE FROM accounts"),
  ]);
}

beforeEach(clearData);

async function accountWithKey(email: string) {
  const accountId = crypto.randomUUID();
  const key = generateKey();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(accountId, email, NOW),
    env.DB.prepare(`
      INSERT INTO credentials (id, account_id, kind, hash, name, created_at)
      VALUES (?, ?, 'api_key', ?, 'MCP test', ?)
    `).bind(crypto.randomUUID(), accountId, await hashToken(key), NOW),
  ]);
  return { accountId, key };
}

async function sessionCookie(email: string) {
  const accountId = crypto.randomUUID();
  const token = "b".repeat(64);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(accountId, email, NOW),
    env.DB.prepare(`
      INSERT INTO credentials (id, account_id, kind, hash, created_at, expires_at)
      VALUES (?, ?, 'session', ?, ?, ?)
    `).bind(crypto.randomUUID(), accountId, await hashToken(token), NOW, NOW + 60_000),
  ]);
  return `pp_session=${token}`;
}

function request(
  key: string | null,
  method = "tools/list",
  params: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  return new Request("https://pairpoll.test/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function callTool(key: string, name: string, args: Record<string, unknown>) {
  const response = await handleMcpRequest(env.DB, request(key, "tools/call", { name, arguments: args }));
  expect(response.status).toBe(200);
  const text = await response.text();
  const payload = response.headers.get("Content-Type")?.includes("text/event-stream")
    ? text.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
    : text;
  if (!payload) throw new Error("MCP returned no JSON-RPC message");
  return JSON.parse(payload) as { result: { isError?: boolean; structuredContent?: Record<string, unknown> } };
}

test("MCP requires a valid API key", async () => {
  const missing = await handleMcpRequest(env.DB, request(null));
  expect(missing.status).toBe(401);
  expect(missing.headers.get("WWW-Authenticate")).toBe("Bearer");

  const wrong = await handleMcpRequest(env.DB, request(`ppk_${"a".repeat(64)}`));
  expect(wrong.status).toBe(401);

  const cookieOnly = await handleMcpRequest(env.DB, request(null, "tools/list", {}, {
    Cookie: await sessionCookie("browser@example.com"),
    Origin: "https://pairpoll.test",
  }));
  expect(cookieOnly.status).toBe(401);

  const owner = await accountWithKey("origin@example.com");
  const crossOrigin = await handleMcpRequest(env.DB, request(owner.key, "tools/list", {}, {
    Origin: "https://evil.test",
  }));
  expect(crossOrigin.status).toBe(403);
});

test("MCP tools hide another account's poll", async () => {
  const owner = await accountWithKey("owner@example.com");
  const other = await accountWithKey("other@example.com");
  const poll = await createPoll(env.DB, owner.accountId, { kind: "image", question: "Pick one" }, NOW);

  const result = await callTool(other.key, "get_results", { pollId: poll.id });
  expect(result.result.isError).toBe(true);
  expect(result.result.structuredContent).toMatchObject({ error: { code: "poll_not_found" } });
});

test("MCP creates and lists a draft for the authenticated owner", async () => {
  const owner = await accountWithKey("creator@example.com");
  const created = await callTool(owner.key, "create_poll", {
    kind: "image",
    question: "Which one is best?",
    topSize: 1,
    voterCap: 25,
  });
  expect(created.result.isError).not.toBe(true);
  expect(created.result.structuredContent).toMatchObject({
    question: "Which one is best?",
    status: "draft",
    topSize: 1,
    voterCap: 25,
  });

  const listed = await callTool(owner.key, "list_polls", {});
  expect(listed.result.structuredContent).toMatchObject({
    polls: [expect.objectContaining({ question: "Which one is best?", status: "draft" })],
  });
});
