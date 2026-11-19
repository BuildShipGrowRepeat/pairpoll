import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { authenticate, revokeKey } from "../../src/server/auth";
import { approveDeviceRequest, exchangeDeviceRequest, startDeviceRequest } from "../../src/server/device";
import { readDevMail } from "../../src/server/email";
import { blockAccount } from "../../src/server/owner";
import { verifyTurnstile } from "../../src/server/security";
import {
  account, authHeaders, call, clearData, credential, databaseState, sessionAuth,
} from "./support";

beforeEach(clearData);
afterEach(() => vi.restoreAllMocks());

function turnstile(result: { success: boolean; hostname?: string; action?: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  }));
}

function signInRequest(email: string, ip: string, token = "verified") {
  return new Request("https://pairpoll.test/api/v1/auth/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ email, token }),
  });
}

async function requestLink(email: string, ip: string, token = "verified") {
  const response = await call("auth/link", signInRequest(email, ip, token));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
}

async function linkCount(email?: string) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM credentials c JOIN accounts a ON a.id = c.account_id
    WHERE c.kind = 'link' AND (? IS NULL OR a.email = ?)
  `).bind(email ?? null, email ?? null).first<number>("count");
  return row ?? 0;
}

describe("SF2 sign-in issuance", () => {
  test("valid, invalid, blocked, unverified and throttled requests have one response shape", async () => {
    turnstile({ success: true, hostname: "pairpoll.test", action: "signin" });
    await requestLink("valid@example.com", "192.0.2.1");
    expect(await linkCount("valid@example.com")).toBe(1);

    await requestLink("not-an-email", "192.0.2.2");
    expect(await linkCount()).toBe(1);

    await account("blocked@example.com", { blocked: true });
    await requestLink("blocked@example.com", "192.0.2.3");
    expect(await linkCount("blocked@example.com")).toBe(0);

    turnstile({ success: false });
    await requestLink("unverified@example.com", "192.0.2.4", "bad");
    expect(await linkCount("unverified@example.com")).toBe(0);

    turnstile({ success: true, hostname: "pairpoll.test", action: "signin" });
    for (let index = 0; index < 6; index++) await requestLink("email-limit@example.com", `198.51.100.${index}`);
    expect(await linkCount("email-limit@example.com")).toBe(5);

    for (let index = 0; index < 31; index++) await requestLink(`ip-limit-${index}@example.com`, "203.0.113.1");
    expect(await linkCount()).toBe(36);
  });

  test.each([
    ["hostname", { success: true, hostname: "evil.test", action: "signin" }],
    ["action", { success: true, hostname: "pairpoll.test", action: "join" }],
  ])("Turnstile rejects the wrong %s", async (_name, result) => {
    turnstile(result);
    const request = signInRequest("person@example.com", "192.0.2.10");
    expect(await verifyTurnstile(request, "token", "secret", "signin")).toBe(false);
    await requestLink("person@example.com", "192.0.2.10");
    expect(await linkCount()).toBe(0);
  });
});

test("expired and revoked credentials cannot authenticate", async () => {
  const active = await account("active@example.com");
  const cases = [
    ["expired session", await credential(active, "session", { expired: true })],
    ["revoked session", await credential(active, "session", { revoked: true })],
    ["revoked key", await credential(active, "api_key", { revoked: true })],
  ] as const;

  for (const [name, value] of cases) {
    const response = await call("whoami", new Request("https://pairpoll.test/api/v1/whoami", {
      headers: authHeaders(value),
    }));
    expect(response.status, name).toBe(401);
    expect(await response.json(), name).toMatchObject({ error: { code: "authentication_required" } });
  }
});

test("blocking an account revokes credentials that were previously usable", async () => {
  const serviceOwner = await account("service-owner@example.com");
  const target = await account("target@example.com");
  const ownerSession = await credential(serviceOwner, "session");
  const targetSession = await credential(target, "session");
  const targetKey = await credential(target, "api_key");
  const sessionRequest = new Request("https://pairpoll.test/api/v1/whoami", { headers: authHeaders(targetSession) });
  const keyRequest = new Request("https://pairpoll.test/api/v1/whoami", { headers: authHeaders(targetKey) });
  expect(await authenticate(env.DB, sessionRequest)).toMatchObject({ accountId: target });
  expect(await authenticate(env.DB, keyRequest)).toMatchObject({ accountId: target });

  expect(await blockAccount(
    env.DB,
    sessionAuth(serviceOwner, "service-owner@example.com", ownerSession),
    "service-owner@example.com",
    target,
  )).toBe(true);
  expect(await authenticate(env.DB, sessionRequest)).toBeNull();
  expect(await authenticate(env.DB, keyRequest)).toBeNull();
  expect(await env.DB.prepare("SELECT blocked_at FROM accounts WHERE id = ?").bind(target)
    .first<number | null>("blocked_at")).not.toBeNull();
});

test("revoking a key immediately denies it without changing other credentials", async () => {
  const owner = await account("owner@example.com");
  const session = await credential(owner, "session");
  const key = await credential(owner, "api_key");
  const auth = sessionAuth(owner, "owner@example.com", session);
  const keyRequest = new Request("https://pairpoll.test/api/v1/whoami", { headers: authHeaders(key) });
  expect(await authenticate(env.DB, keyRequest)).toMatchObject({ accountId: owner, kind: "api_key" });
  expect(await revokeKey(env.DB, auth, key.id)).toBe(true);
  expect(await authenticate(env.DB, keyRequest)).toBeNull();
  expect(await authenticate(env.DB, new Request("https://pairpoll.test/api/v1/whoami", {
    headers: authHeaders(session),
  }))).toMatchObject({ accountId: owner, kind: "session" });
});

test("a device request is approved once and exchanged once under concurrency", async () => {
  const owner = await account("owner@example.com");
  const other = await account("other@example.com");
  const session = await credential(owner, "session");
  const otherSession = await credential(other, "session");
  const device = await startDeviceRequest(env.DB, new Request("https://pairpoll.test/api/v1/device", {
    method: "POST", headers: { "CF-Connecting-IP": "192.0.2.20" },
  }));
  expect(device).not.toBeNull();
  expect(await exchangeDeviceRequest(env.DB, device!.secret)).toEqual({ status: "pending" });
  expect(await approveDeviceRequest(env.DB, sessionAuth(owner, "owner@example.com", session), device!.code)).toBe(true);
  expect(await approveDeviceRequest(env.DB, sessionAuth(other, "other@example.com", otherSession), device!.code)).toBe(false);

  const exchanges = await Promise.all([
    exchangeDeviceRequest(env.DB, device!.secret),
    exchangeDeviceRequest(env.DB, device!.secret),
  ]);
  expect(exchanges.filter((result) => result.status === "approved")).toHaveLength(1);
  expect(exchanges.filter((result) => result.status === "expired")).toHaveLength(1);
  const approved = exchanges.find((result) => result.status === "approved");
  if (!approved || approved.status !== "approved") throw new Error("Device exchange did not return a key");
  expect(await authenticate(env.DB, new Request("https://pairpoll.test/api/v1/whoami", {
    headers: { Authorization: `Bearer ${approved.key}` },
  }))).toMatchObject({ accountId: owner, kind: "api_key" });
  expect(await exchangeDeviceRequest(env.DB, device!.secret)).toEqual({ status: "expired" });
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM credentials WHERE kind = 'api_key'")
    .first<number>("count")).toBe(1);
});

test("the development mailbox is hidden in production mode", async () => {
  const before = await databaseState();
  expect(await readDevMail(env.DB, new Request("http://localhost/api/v1/dev/mail"), false)).toBeNull();
  expect(await databaseState()).toEqual(before);
});
