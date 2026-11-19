import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";
import {
  NOW, PNG, account, authHeaders, call, clearData, credential, databaseState, poll, readyItem,
} from "./support";

beforeEach(clearData);

type RouteCase = { name: string; path: string; request: () => Request };

function request(method: string, path: string, headers: HeadersInit = {}, body?: BodyInit) {
  return new Request(`https://pairpoll.test/api/v1/${path}`, { method, headers, body });
}

function jsonRequest(method: string, path: string, headers: HeadersInit = {}, value: unknown = {}) {
  return request(method, path, { "Content-Type": "application/json", ...headers }, JSON.stringify(value));
}

function creatorRoutes(ids: { poll: string; item: string; run: string }, headers: HeadersInit = {}): RouteCase[] {
  return [
    { name: "identity", path: "whoami", request: () => request("GET", "whoami", headers) },
    { name: "list polls", path: "polls", request: () => request("GET", "polls", headers) },
    { name: "create poll", path: "polls", request: () => jsonRequest("POST", "polls", headers, {
      kind: "image", question: "Question", topSize: 1, playsOnce: false, voterCap: 5,
    }) },
    { name: "read poll", path: `polls/${ids.poll}`, request: () => request("GET", `polls/${ids.poll}`, headers) },
    { name: "update poll", path: `polls/${ids.poll}`, request: () => jsonRequest("PATCH", `polls/${ids.poll}`, headers, { question: "Changed" }) },
    { name: "delete poll", path: `polls/${ids.poll}`, request: () => request("DELETE", `polls/${ids.poll}`, headers) },
    { name: "duplicate poll", path: `polls/${ids.poll}/duplicate`, request: () => request("POST", `polls/${ids.poll}/duplicate`, headers) },
    { name: "upload item", path: `polls/${ids.poll}/items`, request: () => request("POST", `polls/${ids.poll}/items`, {
      ...headers, "Content-Length": String(PNG.byteLength),
    }, PNG) },
    { name: "upload poster", path: `polls/${ids.poll}/items/${ids.item}/poster`, request: () => request(
      "POST", `polls/${ids.poll}/items/${ids.item}/poster`, { ...headers, "Content-Length": String(PNG.byteLength) }, PNG,
    ) },
    { name: "remove item", path: `polls/${ids.poll}/items/${ids.item}`, request: () => request("DELETE", `polls/${ids.poll}/items/${ids.item}`, headers) },
    { name: "reorder items", path: `polls/${ids.poll}/items/reorder`, request: () => jsonRequest(
      "POST", `polls/${ids.poll}/items/reorder`, headers, { ids: [ids.item] },
    ) },
    { name: "open poll", path: `polls/${ids.poll}/open`, request: () => request("POST", `polls/${ids.poll}/open`, headers) },
    { name: "close poll", path: `polls/${ids.poll}/close`, request: () => request("POST", `polls/${ids.poll}/close`, headers) },
    { name: "read results", path: `polls/${ids.poll}/results`, request: () => request("GET", `polls/${ids.poll}/results`, headers) },
    { name: "export results", path: `polls/${ids.poll}/export`, request: () => request("GET", `polls/${ids.poll}/export`, headers) },
    { name: "share results", path: `polls/${ids.poll}/sharing`, request: () => jsonRequest(
      "POST", `polls/${ids.poll}/sharing`, headers, { enabled: true },
    ) },
    { name: "delete run", path: `polls/${ids.poll}/runs/${ids.run}`, request: () => request("DELETE", `polls/${ids.poll}/runs/${ids.run}`, headers) },
  ];
}

describe("SF1 creator permission boundaries", () => {
  test("every creator route denies missing authentication without changing data", async () => {
    const owner = await account("owner@example.com");
    const created = await poll(owner);
    const item = await readyItem(created.id, 0);
    const run = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO runs (id, poll_id, browser_hash, name, seed, created_at) VALUES (?, ?, ?, 'Voter', 1, ?)
    `).bind(run, created.id, "b".repeat(64), NOW).run();
    const before = await databaseState();

    for (const route of creatorRoutes({ poll: created.id, item: item.id, run })) {
      const response = await call(route.path, route.request());
      expect(response.status, route.name).toBe(401);
      expect(await response.json(), route.name).toMatchObject({ error: { code: "authentication_required" } });
    }
    expect(await databaseState()).toEqual(before);
  });

  test("every creator resource route hides another account's poll, item and run", async () => {
    const owner = await account("owner@example.com");
    const attacker = await account("attacker@example.com");
    const attackerKey = await credential(attacker, "api_key");
    const created = await poll(owner);
    const item = await readyItem(created.id, 0);
    const run = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO runs (id, poll_id, browser_hash, name, seed, created_at) VALUES (?, ?, ?, 'Voter', 1, ?)
    `).bind(run, created.id, "c".repeat(64), NOW).run();
    const routes = creatorRoutes({ poll: created.id, item: item.id, run }, authHeaders(attackerKey)).slice(3);
    const before = await databaseState();

    for (const route of routes) {
      const response = await call(route.path, route.request());
      expect(response.status, route.name).toBe(404);
      expect(await response.json(), route.name).toMatchObject({
        error: { code: route.name === "delete run" ? "run_not_found" : "poll_not_found" },
      });
    }
    expect(await databaseState()).toEqual(before);
  });

  test("foreign item and run ids stay hidden under an owned poll", async () => {
    const owner = await account("owner@example.com");
    const attacker = await account("attacker@example.com");
    const attackerKey = await credential(attacker, "api_key");
    const foreignPoll = await poll(owner, { kind: "video" });
    const foreignItem = await readyItem(foreignPoll.id, 0, { mime: "video/mp4" });
    const foreignRun = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO runs (id, poll_id, browser_hash, name, seed, created_at) VALUES (?, ?, ?, 'Voter', 1, ?)
    `).bind(foreignRun, foreignPoll.id, "f".repeat(64), NOW).run();
    const ownedPoll = await poll(attacker, { kind: "video" });
    await readyItem(ownedPoll.id, 0, { mime: "video/mp4" });
    const headers = authHeaders(attackerKey);
    const cases: Array<RouteCase & { status: number; code: string }> = [
      {
        name: "poster", path: `polls/${ownedPoll.id}/items/${foreignItem.id}/poster`, status: 404,
        code: "item_not_found", request: () => request("POST", `polls/${ownedPoll.id}/items/${foreignItem.id}/poster`, {
          ...headers, "Content-Length": String(PNG.byteLength),
        }, PNG),
      },
      {
        name: "remove item", path: `polls/${ownedPoll.id}/items/${foreignItem.id}`, status: 404,
        code: "item_not_found", request: () => request("DELETE", `polls/${ownedPoll.id}/items/${foreignItem.id}`, headers),
      },
      {
        name: "reorder", path: `polls/${ownedPoll.id}/items/reorder`, status: 409,
        code: "poll_changed", request: () => jsonRequest("POST", `polls/${ownedPoll.id}/items/reorder`, headers, {
          ids: [foreignItem.id],
        }),
      },
      {
        name: "delete run", path: `polls/${ownedPoll.id}/runs/${foreignRun}`, status: 404,
        code: "run_not_found", request: () => request("DELETE", `polls/${ownedPoll.id}/runs/${foreignRun}`, headers),
      },
    ];
    const before = await databaseState();

    for (const route of cases) {
      const response = await call(route.path, route.request());
      expect(response.status, route.name).toBe(route.status);
      expect(await response.json(), route.name).toMatchObject({ error: { code: route.code } });
    }
    expect(await databaseState()).toEqual(before);
  });
});

describe("SF1 session-only and owner permission boundaries", () => {
  test("a bearer key is denied by every session-only route", async () => {
    const owner = await account("owner@example.com");
    const attacker = await account("attacker@example.com");
    const foreignKey = await credential(owner, "api_key");
    const attackerKey = await credential(attacker, "api_key");
    const headers = authHeaders(attackerKey);
    const cases: RouteCase[] = [
      { name: "logout", path: "auth/logout", request: () => request("POST", "auth/logout", headers) },
      { name: "approve device", path: "device/approve", request: () => jsonRequest("POST", "device/approve", headers, { code: "23456789" }) },
      { name: "list keys", path: "keys", request: () => request("GET", "keys", headers) },
      { name: "create key", path: "keys", request: () => jsonRequest("POST", "keys", headers, { name: "Agent" }) },
      { name: "revoke key", path: `keys/${foreignKey.id}`, request: () => request("DELETE", `keys/${foreignKey.id}`, headers) },
      { name: "read account", path: "account/me", request: () => request("GET", "account/me", headers) },
      { name: "logout everywhere", path: "account/logout-everywhere", request: () => request("POST", "account/logout-everywhere", headers) },
      { name: "delete account", path: "account", request: () => request("DELETE", "account", headers) },
    ];
    const before = await databaseState();

    for (const route of cases) {
      const response = await call(route.path, route.request());
      expect(response.status, route.name).toBe(401);
      expect(await response.json(), route.name).toMatchObject({ error: { code: "session_required" } });
    }
    expect(await databaseState()).toEqual(before);
  });

  test("every owner route denies a signed-in non-owner and leaves foreign resources unchanged", async () => {
    const owner = await account("resource-owner@example.com");
    const other = await account("other@example.com");
    const otherSession = await credential(other, "session");
    const created = await poll(owner);
    const headers = authHeaders(otherSession);
    const cases: RouteCase[] = [
      { name: "overview", path: "owner", request: () => request("GET", "owner", headers) },
      { name: "takedown", path: `owner/polls/${created.id}/takedown`, request: () => request("POST", `owner/polls/${created.id}/takedown`, headers) },
      { name: "block", path: `owner/accounts/${owner}/block`, request: () => request("POST", `owner/accounts/${owner}/block`, headers) },
    ];
    const before = await databaseState();

    for (const route of cases) {
      const response = await call(route.path, route.request());
      expect(response.status, route.name).toBe(403);
      expect(await response.json(), route.name).toMatchObject({ error: { code: "owner_required" } });
    }
    expect(await databaseState()).toEqual(before);
  });
});

test("missing and foreign Origins deny every cookie mutation before data changes", async () => {
  const owner = await account("owner@example.com");
  const session = await credential(owner, "session");
  const created = await poll(owner, { kind: "video" });
  const item = await readyItem(created.id, 0, { mime: "video/mp4" });
  const run = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO runs (id, poll_id, browser_hash, name, seed, created_at) VALUES (?, ?, ?, 'Voter', 1, ?)
  `).bind(run, created.id, "d".repeat(64), NOW).run();
  const cookie = `pp_session=${session.token}; pairpoll_voter=${"e".repeat(64)}`;
  const paths: Array<[string, string, unknown?]> = [
    ["POST", "auth/link", { email: "person@example.com", token: "turnstile" }],
    ["POST", "auth/consume", { token: "a".repeat(64) }],
    ["POST", "auth/logout"],
    ["POST", "device"],
    ["POST", "device/approve", { code: "23456789" }],
    ["POST", "keys", { name: "Agent" }],
    ["DELETE", `keys/${session.id}`],
    ["POST", "account/logout-everywhere"],
    ["DELETE", "account"],
    ["POST", "polls", { kind: "image", question: "Question", topSize: 1, playsOnce: false, voterCap: 5 }],
    ["PATCH", `polls/${created.id}`, { question: "Changed" }],
    ["DELETE", `polls/${created.id}`],
    ["POST", `polls/${created.id}/duplicate`],
    ["POST", `polls/${created.id}/items`],
    ["POST", `polls/${created.id}/items/${item.id}/poster`],
    ["DELETE", `polls/${created.id}/items/${item.id}`],
    ["POST", `polls/${created.id}/items/reorder`, { ids: [item.id] }],
    ["POST", `polls/${created.id}/open`],
    ["POST", `polls/${created.id}/close`],
    ["POST", `polls/${created.id}/sharing`, { enabled: true }],
    ["DELETE", `polls/${created.id}/runs/${run}`],
    ["POST", "public/code/join", { name: "Voter", token: "turnstile" }],
    ["POST", "public/code/events", { type: "vote", revision: 0, index: 0, winner: item.id }],
    ["POST", "public/code/report", { reason: "Report" }],
    ["POST", `owner/polls/${created.id}/takedown`],
    ["POST", `owner/accounts/${owner}/block`],
  ];

  for (const origin of [undefined, "https://evil.test"]) {
    for (const [method, path, value] of paths) {
      const headers: Record<string, string> = { Cookie: cookie };
      if (origin) headers.Origin = origin;
      let body: BodyInit | undefined;
      if (path.endsWith("/items") || path.endsWith("/poster")) {
        headers["Content-Length"] = String(PNG.byteLength);
        body = PNG;
      } else if (value !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(value);
      }
      const before = await databaseState();
      const response = await call(path, request(method, path, headers, body));
      expect(response.status, `${method} ${path} ${origin ?? "missing Origin"}`).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_origin" } });
      expect(await databaseState()).toEqual(before);
    }
  }
});
