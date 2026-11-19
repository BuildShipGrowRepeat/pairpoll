import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deleteAccount, pruneAuthData } from "../../src/server/account";
import { generateKey } from "../../src/server/auth";
import {
  MCP_SCOPE,
  consumeAuthorizationRateLimit,
  handleOAuthRequest,
  oauthHelpers,
  requireS256,
  revokeAllConnectedApps,
  revokeConnectedApp,
  revokePendingOAuthAccounts,
  revokePendingOAuthGrants,
} from "../../src/server/oauth";
import {
  consumeOAuthConsent,
  markOAuthGrantsRevoked,
  recordOAuthConsent,
} from "../../src/server/oauth-grants";
import { hashToken } from "../../src/server/security";
import { account, clearData, credential, sessionAuth } from "./support";

const ORIGIN = "https://pairpoll.test";
const RESOURCE = `${ORIGIN}/mcp`;
const REDIRECT = "https://client.example/callback";
const defaultHandler: ExportedHandler<Env> = { fetch: () => new Response("Not found", { status: 404 }) };
let ipSequence = 1;

async function clearKv() {
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_KV.list({ cursor });
    await Promise.all(page.keys.map((key) => env.OAUTH_KV.delete(key.name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

beforeEach(async () => {
  await clearData();
  await clearKv();
});
afterEach(() => vi.restoreAllMocks());

async function dispatch(request: Request) {
  return handleOAuthRequest(request, env, createExecutionContext(), defaultHandler);
}

function streamedTokenRequest(chunks: Uint8Array[], ip: string) {
  return new Request(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": "1",
      "CF-Connecting-IP": ip,
    },
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  });
}

async function registerClient() {
  const response = await dispatch(new Request(`${ORIGIN}/oauth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": `192.0.2.${ipSequence++}`,
    },
    body: JSON.stringify({
      client_name: "Pairpoll test client",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  }));
  expect(response.status).toBe(201);
  return response.json() as Promise<{ client_id: string }>;
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function authorize(accountId: string, redirectUri = REDIRECT) {
  const client = await registerClient();
  const verifier = "pairpoll-oauth-test-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const url = new URL("/oauth/authorize", ORIGIN);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirectUri,
    scope: MCP_SCOPE,
    state: "test-state",
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
    resource: RESOURCE,
  }).toString();
  const oauth = oauthHelpers(env, ORIGIN);
  const parsed = await oauth.parseAuthRequest(new Request(url));
  requireS256(parsed);
  const description = await oauth.describeConsent(parsed);
  const consent = await oauth.beginConsent(parsed);
  await recordOAuthConsent(env.DB, consent.handle, accountId);
  const cookie = consent.headers.get("Set-Cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Consent did not set a binding cookie");
  expect(await consumeOAuthConsent(env.DB, consent.handle, accountId)).toBe(true);
  const approved = await oauth.approveConsent(new Request(`${ORIGIN}/oauth/authorize`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: ORIGIN },
  }), consent.handle, { scope: [MCP_SCOPE] });
  const completed = await oauth.completeAuthorization({
    request: approved.request,
    userId: accountId,
    scope: [MCP_SCOPE],
    metadata: { clientName: description.clientName, redirectHost: description.redirectHost },
    props: { accountId, access: "oauth" },
  });
  const code = new URL(completed.redirectTo).searchParams.get("code");
  if (!code) throw new Error("Authorization did not return a code");
  return { clientId: client.client_id, code, verifier, redirectUri };
}

async function exchange(
  flow: Awaited<ReturnType<typeof authorize>>,
  options: { verifier?: string; redirectUri?: string } = {},
) {
  return dispatch(new Request(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: flow.clientId,
      code: flow.code,
      redirect_uri: options.redirectUri ?? flow.redirectUri,
      code_verifier: options.verifier ?? flow.verifier,
      resource: RESOURCE,
    }),
  }));
}

async function tokenFor(accountId: string) {
  const flow = await authorize(accountId);
  const response = await exchange(flow);
  expect(response.status).toBe(200);
  const token = await response.json<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    resource: string;
  }>();
  return { flow, token };
}

function mcpRequest(token?: string, method = "tools/list", params: Record<string, unknown> = {}) {
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function mcpPayload(response: Response) {
  const text = await response.text();
  const json = response.headers.get("Content-Type")?.includes("text/event-stream")
    ? text.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
    : text;
  if (!json) throw new Error("MCP returned no JSON-RPC message");
  return JSON.parse(json) as { result?: { structuredContent?: unknown }; error?: unknown };
}

test("authorization code with PKCE reaches an MCP tool and refreshes", async () => {
  const accountId = await account("oauth@example.com");
  const { flow, token } = await tokenFor(accountId);
  expect(token.expires_in).toBe(3600);
  expect(token.resource).toBe(RESOURCE);

  const call = await dispatch(mcpRequest(token.access_token, "tools/call", {
    name: "list_polls",
    arguments: {},
  }));
  expect(call.status).toBe(200);
  expect(await mcpPayload(call)).toMatchObject({ result: { structuredContent: { polls: [] } } });

  const refreshed = await dispatch(new Request(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: flow.clientId,
      refresh_token: token.refresh_token,
      resource: RESOURCE,
    }),
  }));
  expect(refreshed.status).toBe(200);
  expect(await refreshed.json()).toMatchObject({ token_type: "bearer", resource: RESOURCE });
});

test("a wrong PKCE verifier cannot exchange the code", async () => {
  const flow = await authorize(await account("verifier@example.com"));
  const response = await exchange(flow, { verifier: "wrong-verifier-that-is-long-enough-012345678901234567890" });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "invalid_grant" });
});

test("an authorization code cannot be reused", async () => {
  const flow = await authorize(await account("replay@example.com"));
  expect((await exchange(flow)).status).toBe(200);
  const replay = await exchange(flow);
  expect(replay.status).toBe(400);
  expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
});

test("concurrent authorization code exchanges cannot both succeed", async () => {
  const flow = await authorize(await account("concurrent-code@example.com"));
  const responses = await Promise.all([exchange(flow), exchange(flow)]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  const accepted = responses.find((response) => response.status === 200)!;
  const token = await accepted.json<{ access_token: string }>();
  expect((await dispatch(mcpRequest(token.access_token))).status).toBe(200);
});

test("the token exchange requires the exact authorized redirect URI", async () => {
  const flow = await authorize(await account("redirect@example.com"));
  const response = await exchange(flow, { redirectUri: "https://other.example/callback" });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "invalid_grant" });
});

test("disconnecting a grant denies its access token", async () => {
  const accountId = await account("revoked@example.com");
  const { token } = await tokenFor(accountId);
  const grants = await oauthHelpers(env, ORIGIN).listUserGrants(accountId);
  expect(grants.items).toHaveLength(1);
  await revokeConnectedApp(env, ORIGIN, accountId, grants.items[0].id);
  const response = await dispatch(mcpRequest(token.access_token));
  expect(response.status).toBe(401);
});

test("pending KV cleanup is acknowledged without losing the revocation tombstone", async () => {
  const accountId = await account("pending-cleanup@example.com");
  await tokenFor(accountId);
  const grant = (await oauthHelpers(env, ORIGIN).listUserGrants(accountId)).items[0];
  await markOAuthGrantsRevoked(env.DB, accountId, [grant.id]);
  expect(await env.DB.prepare(`
    SELECT cleanup_pending FROM oauth_grant_states WHERE account_id = ? AND grant_id = ?
  `).bind(accountId, grant.id).first("cleanup_pending")).toBe(1);
  await revokePendingOAuthGrants(env, ORIGIN);
  expect(await env.DB.prepare(`
    SELECT cleanup_pending FROM oauth_grant_states WHERE account_id = ? AND grant_id = ?
  `).bind(accountId, grant.id).first("cleanup_pending")).toBe(0);
  expect((await oauthHelpers(env, ORIGIN).listUserGrants(accountId)).items).toHaveLength(0);
});

test("account cleanup survives removal of the account row", async () => {
  const accountId = await account("removed-before-cleanup@example.com");
  const session = await credential(accountId, "session");
  await tokenFor(accountId);
  const grant = (await oauthHelpers(env, ORIGIN).listUserGrants(accountId)).items[0];
  await markOAuthGrantsRevoked(env.DB, accountId, [grant.id]);
  await oauthHelpers(env, ORIGIN).revokeGrant(grant.id, accountId);
  expect(await deleteAccount(
    env.DB,
    sessionAuth(accountId, "removed-before-cleanup@example.com", session),
  )).toBe(true);
  await pruneAuthData(env.DB);
  expect(await env.DB.prepare("SELECT id FROM accounts WHERE id = ?").bind(accountId).first()).toBeNull();
  expect(await env.DB.prepare(`
    SELECT account_id FROM oauth_account_cleanup WHERE account_id = ?
  `).bind(accountId).first("account_id")).toBe(accountId);
  await revokePendingOAuthAccounts(env, ORIGIN);
  expect(await env.DB.prepare(`
    SELECT account_id FROM oauth_account_cleanup WHERE account_id = ?
  `).bind(accountId).first("account_id")).toBeNull();
  expect((await oauthHelpers(env, ORIGIN).listUserGrants(accountId)).items).toHaveLength(0);
  expect(await env.DB.prepare(`
    SELECT grant_id FROM oauth_grant_states WHERE account_id = ?
  `).bind(accountId).first("grant_id")).toBeNull();
});

test("deleting an account revokes every OAuth grant", async () => {
  const accountId = await account("deleted-oauth@example.com");
  const session = await credential(accountId, "session");
  const { token } = await tokenFor(accountId);
  expect(await deleteAccount(
    env.DB,
    sessionAuth(accountId, "deleted-oauth@example.com", session),
    (id) => revokeAllConnectedApps(env, ORIGIN, id),
  )).toBe(true);
  expect((await oauthHelpers(env, ORIGIN).listUserGrants(accountId)).items).toHaveLength(0);
  expect((await dispatch(mcpRequest(token.access_token))).status).toBe(401);
});

test("a blocked account cannot use or refresh an issued token", async () => {
  const accountId = await account("blocked-oauth@example.com");
  const { flow, token } = await tokenFor(accountId);
  await env.DB.prepare("UPDATE accounts SET blocked_at = ? WHERE id = ?").bind(Date.now(), accountId).run();

  expect((await dispatch(mcpRequest(token.access_token))).status).toBe(401);
  const refresh = await dispatch(new Request(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: flow.clientId,
      refresh_token: token.refresh_token,
      resource: RESOURCE,
    }),
  }));
  expect(refresh.status).toBe(400);
  expect(await refresh.json()).toMatchObject({ error: "invalid_grant" });
});

test("OAuth MCP access keeps the existing cross-origin denial", async () => {
  const { token } = await tokenFor(await account("origin-oauth@example.com"));
  const request = mcpRequest(token.access_token);
  request.headers.set("Origin", "https://evil.example");
  expect((await dispatch(request)).status).toBe(403);
});

test("an expired access token is rejected", async () => {
  const { token } = await tokenFor(await account("expired-oauth@example.com"));
  const future = Date.now() + 3_601_000;
  vi.spyOn(Date, "now").mockReturnValue(future);
  expect((await dispatch(mcpRequest(token.access_token))).status).toBe(401);
});

test("existing Pairpoll API keys still authenticate at the protected MCP route", async () => {
  const accountId = await account("api-key@example.com");
  const key = generateKey();
  await env.DB.prepare(`
    INSERT INTO credentials (id, account_id, kind, hash, name, created_at)
    VALUES (?, ?, 'api_key', ?, 'OAuth regression', ?)
  `).bind(crypto.randomUUID(), accountId, await hashToken(key), Date.now()).run();
  const response = await dispatch(mcpRequest(key));
  expect(response.status).toBe(200);
  expect(await mcpPayload(response)).toHaveProperty("result");
});

test("an unauthenticated MCP request advertises protected resource metadata", async () => {
  const response = await dispatch(mcpRequest());
  expect(response.status).toBe(401);
  expect(response.headers.get("WWW-Authenticate")).toContain(
    `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
  );
  const metadata = await dispatch(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`));
  expect(metadata.status).toBe(200);
  expect(await metadata.json()).toMatchObject({
    resource: RESOURCE,
    authorization_servers: [ORIGIN],
    scopes_supported: [MCP_SCOPE],
  });
  const server = await dispatch(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`));
  expect(server.status).toBe(200);
  expect(await server.json()).toMatchObject({
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/oauth/authorize`,
    token_endpoint: `${ORIGIN}/oauth/token`,
    registration_endpoint: `${ORIGIN}/oauth/register`,
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
  });
});

test("only the exact MCP path is protected by the OAuth provider", async () => {
  const response = await dispatch(new Request(`${ORIGIN}/mcp/anything`, { method: "POST" }));
  expect(response.status).toBe(404);
});

test("the token endpoint rejects a streamed body over 8 KB despite a smaller Content-Length", async () => {
  const response = await dispatch(streamedTokenRequest([
    new Uint8Array(8 * 1024),
    new Uint8Array(1),
  ], "198.51.100.42"));
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ error: "invalid_request" });
});

test("a consent handle is bound to one account and consumed once", async () => {
  const owner = await account("consent-owner@example.com");
  const other = await account("consent-other@example.com");
  const handle = "consent-handle-that-is-secret";
  await recordOAuthConsent(env.DB, handle, owner);
  expect(await consumeOAuthConsent(env.DB, handle, other)).toBe(false);
  expect(await consumeOAuthConsent(env.DB, handle, owner)).toBe(true);
  expect(await consumeOAuthConsent(env.DB, handle, owner)).toBe(false);
});

test("daily auth cleanup expires old grants and catches up with one IP's abandoned consents", async () => {
  const accountId = await account("oauth-cleanup@example.com");
  const now = Date.now();
  const expired = now - 30 * 24 * 60 * 60 * 1000 - 1;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO oauth_grant_states (account_id, grant_id, code_exchanged_at)
      VALUES (?, 'expired-grant-01', ?), (?, 'current-grant-01', ?)
    `).bind(accountId, expired, accountId, expired + 2),
    env.DB.prepare(`
      INSERT INTO oauth_grant_states (account_id, grant_id, code_exchanged_at, cleanup_pending)
      VALUES (?, 'pending-grant-01', ?, 1)
    `).bind(accountId, expired),
    env.DB.prepare(`
      WITH RECURSIVE attempts(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM attempts WHERE n < 720)
      INSERT INTO oauth_consent_states (handle_hash, account_id, expires_at)
      SELECT printf('expired-consent-%03d', n), ?, ? FROM attempts
    `).bind(accountId, now - 1),
  ]);

  await pruneAuthData(env.DB, now);

  const grants = await env.DB.prepare(`
    SELECT grant_id FROM oauth_grant_states WHERE account_id = ? ORDER BY grant_id
  `).bind(accountId).all<{ grant_id: string }>();
  expect(grants.results.map((row) => row.grant_id)).toEqual(["current-grant-01", "pending-grant-01"]);
  expect(await env.DB.prepare("SELECT COUNT(*) FROM oauth_consent_states").first<number>("COUNT(*)")).toBe(0);
});

test("registration, authorization and token attempts are limited per IP", async () => {
  const registrationIp = "198.51.100.40";
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await dispatch(new Request(`${ORIGIN}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": registrationIp },
      body: "{}",
    }));
    expect(response.status).not.toBe(429);
  }
  expect((await dispatch(new Request(`${ORIGIN}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": registrationIp },
    body: "{}",
  }))).status).toBe(429);

  const authorizationRequest = new Request(`${ORIGIN}/oauth/authorize`, {
    headers: { "CF-Connecting-IP": "198.51.100.41" },
  });
  for (let attempt = 0; attempt < 30; attempt++) {
    expect(await consumeAuthorizationRateLimit(env.DB, authorizationRequest)).toBe(true);
  }
  expect(await consumeAuthorizationRateLimit(env.DB, authorizationRequest)).toBe(false);

  const tokenIp = "198.51.100.43";
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = await dispatch(new Request(`${ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": tokenIp,
      },
      body: "grant_type=refresh_token",
    }));
    expect(response.status).not.toBe(429);
  }
  expect((await dispatch(new Request(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": tokenIp,
    },
    body: "grant_type=refresh_token",
  }))).status).toBe(429);
});
