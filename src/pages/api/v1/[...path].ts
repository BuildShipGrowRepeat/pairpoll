import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { deleteAccount, signOutEverywhere } from "../../../server/account.js";
import {
  authenticate, authenticateSession, clearSessionCookie, consumeSignInLink, createKey, listKeys,
  requestSignInLink, revokeKey, sessionCookie, signOut,
} from "../../../server/auth.js";
import { approveDeviceRequest, exchangeDeviceRequest, startDeviceRequest } from "../../../server/device.js";
import { readDevMail } from "../../../server/email.js";
import { ServerError } from "../../../server/errors.js";
import { duplicatePoll, removeItem, serveMedia, uploadItem, uploadPoster } from "../../../server/media.js";
import { blockAccount, getOwnerOverview, ownerAccess } from "../../../server/owner.js";
import {
  closePoll, createPoll, deletePoll, getPoll, listPolls, openPoll, reorderItems, setResultsSharing, updatePoll,
} from "../../../server/polls.js";
import { submitReport, takeDownPoll } from "../../../server/reports.js";
import { getResults, getSharedResults, resultsCsv } from "../../../server/results.js";
import {
  deleteRun, getPublicPoll, getVoterState, joinPoll, newVoterToken, recordVoterEvent,
  voterCookie, voterToken, type VoterEvent,
} from "../../../server/runs.js";
import { consumeRateLimit, readBearer, requestIp, sameOrigin, verifyTurnstile } from "../../../server/security.js";

export const prerender = false;

function json(value: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

const MAX_JSON_BYTES = 64 * 1024;

async function body(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)) {
    throw new ServerError(413, "request_too_large", "Send a JSON body no larger than 64 KB.");
  }
  if (!request.body) throw new ServerError(400, "invalid_json", "Send a JSON object.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new ServerError(413, "request_too_large", "Send a JSON body no larger than 64 KB.");
    }
    chunks.push(chunk.value);
  }
  let parsed: unknown;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ServerError(400, "invalid_json", "Send a JSON object.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ServerError(400, "invalid_json", "Send a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function method(request: Request, ...allowed: string[]) {
  if (!allowed.includes(request.method)) {
    throw new ServerError(405, "method_not_allowed", `Use ${allowed.join(" or ")}.`, { allowed });
  }
}

async function creator(request: Request) {
  const auth = await authenticate(env.DB, request);
  if (!auth) throw new ServerError(401, "authentication_required", "Sign in or use an API key.");
  return auth;
}

async function session(request: Request) {
  const auth = await authenticateSession(env.DB, request);
  if (!auth) throw new ServerError(401, "session_required", "Sign in in your browser.");
  return auth;
}

async function owner(request: Request) {
  const auth = await session(request);
  if (!ownerAccess(auth, (env as typeof env & { OWNER_EMAILS?: string }).OWNER_EMAILS)) throw new ServerError(403, "owner_required", "Owner access is required.");
  return auth;
}

async function route(request: Request, path: string) {
  const parts = path.split("/").filter(Boolean);
  const [root, id, action, sub, tail] = parts;
  const m = request.method;
  // Reject cross-origin cookie mutations, including requests that would set a cookie.
  if (!["GET", "HEAD", "OPTIONS"].includes(m) &&
      (request.headers.has("Cookie") || (root === "auth" && id === "consume") ||
        (root === "public" && action === "join")) &&
      !sameOrigin(request)) {
    throw new ServerError(403, "invalid_origin", "Send this request from the same origin.");
  }

  if (root === "auth" && parts.length === 2) {
    method(request, "POST");
    if (id === "link") {
      const input = await body(request);
      await requestSignInLink(env.DB, request, {
        email: string(input.email), token: string(input.token), turnstileSecret: env.TURNSTILE_SECRET_KEY,
        dev: import.meta.env.DEV,
      });
      return json({ ok: true });
    }
    if (id === "consume") {
      const input = await body(request);
      const result = await consumeSignInLink(env.DB, string(input.token));
      if (!result) throw new ServerError(400, "invalid_link", "This sign-in link is invalid or expired.");
      return json({ email: result.email }, 200, { "Set-Cookie": sessionCookie(result.token) });
    }
    if (id === "logout") {
      await signOut(env.DB, await session(request));
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    }
  }
  if (root === "device" && parts.length === 1) {
    method(request, "POST", "GET");
    if (m === "POST") {
      const result = await startDeviceRequest(env.DB, request);
      if (!result) throw new ServerError(429, "device_limit", "Try starting again later.");
      return json(result, 201);
    }
    return json(await exchangeDeviceRequest(env.DB, readBearer(request) ?? ""));
  }
  if (root === "device" && id === "approve" && parts.length === 2) {
    method(request, "POST");
    const auth = await session(request);
    if (!await approveDeviceRequest(env.DB, auth, string((await body(request)).code))) {
      throw new ServerError(400, "invalid_device_code", "This code is invalid, expired or already used.");
    }
    return json({ ok: true });
  }
  if (root === "keys" && parts.length <= 2) {
    if (!id) {
      method(request, "GET", "POST");
      const auth = await session(request);
      if (m === "GET") return json(await listKeys(env.DB, auth));
      const input = await body(request);
      const result = await createKey(env.DB, auth, string(input.name));
      if (!result) throw new ServerError(401, "session_required", "Sign in in your browser.");
      return json(result, 201);
    }
    method(request, "DELETE");
    if (!await revokeKey(env.DB, await session(request), id)) throw new ServerError(404, "key_not_found", "This key was not found.");
    return json({ ok: true });
  }
  if (root === "account" && parts.length <= 2) {
    if (!id) {
      method(request, "DELETE");
      if (!await deleteAccount(env.DB, await session(request))) throw new ServerError(401, "session_required", "Sign in in your browser.");
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    }
    if (id === "me") {
      method(request, "GET");
      const auth = await session(request);
      return json({ email: auth.email });
    }
    if (id === "logout-everywhere") {
      method(request, "POST");
      await signOutEverywhere(env.DB, await session(request));
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    }
  }
  if (root === "polls") {
    if (!id && parts.length === 1) {
      method(request, "GET", "POST");
      const auth = await creator(request);
      return m === "GET" ? json(await listPolls(env.DB, auth.accountId)) : json(await createPoll(env.DB, auth.accountId, await body(request)), 201);
    }
    if (id && parts.length === 2) {
      method(request, "GET", "PATCH", "DELETE");
      const auth = await creator(request);
      if (m === "GET") return json(await getPoll(env.DB, auth.accountId, id));
      if (m === "PATCH") return json(await updatePoll(env.DB, auth.accountId, id, await body(request)));
      await deletePoll(env.DB, auth.accountId, id);
      return json({ ok: true });
    }
    if (id && parts.length === 3 && ["duplicate", "open", "close", "results", "export", "sharing", "items"].includes(action)) {
      method(request, ...(action === "results" || action === "export" ? ["GET"] : ["POST"]));
      const auth = await creator(request);
      if (action === "duplicate") return json(await duplicatePoll(env.DB, env.MEDIA, auth.accountId, id), 201);
      if (action === "open") return json(await openPoll(env.DB, auth.accountId, id));
      if (action === "close") return json(await closePoll(env.DB, auth.accountId, id));
      if (action === "results") return json(await getResults(env.DB, auth.accountId, id));
      if (action === "export") {
        const format = new URL(request.url).searchParams.get("format") ?? "json";
        if (format !== "json" && format !== "csv") throw new ServerError(400, "invalid_format", "Choose json or csv.");
        const results = await getResults(env.DB, auth.accountId, id);
        return format === "json" ? json(results) : new Response(resultsCsv(results), {
          headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="pairpoll-results.csv"', "Cache-Control": "no-store" },
        });
      }
      if (action === "sharing") {
        const input = await body(request);
        return json(await setResultsSharing(env.DB, auth.accountId, id, input.enabled as boolean, input.shareNames as boolean | undefined));
      }
      return json(await uploadItem(env.DB, env.MEDIA, auth.accountId, id, request), 201);
    }
    if (id && action === "items" && sub && parts.length === 4) {
      if (sub === "reorder") {
        method(request, "POST");
        const auth = await creator(request);
        return json(await reorderItems(env.DB, auth.accountId, id, (await body(request)).ids));
      }
      method(request, "DELETE");
      const auth = await creator(request);
      await removeItem(env.DB, auth.accountId, id, sub);
      return json({ ok: true });
    }
    if (id && action === "items" && sub && tail === "poster" && parts.length === 5) {
      method(request, "POST");
      const auth = await creator(request);
      return json(await uploadPoster(env.DB, env.MEDIA, auth.accountId, id, sub, request), 201);
    }
    if (id && action === "runs" && sub && parts.length === 4) {
      method(request, "DELETE");
      const auth = await creator(request);
      await deleteRun(env.DB, auth.accountId, id, sub);
      return json({ ok: true });
    }
  }
  if (root === "public" && id) {
    if (parts.length === 2) {
      method(request, "GET");
      return json(await getPublicPoll(env.DB, id));
    }
    if (parts.length === 3 && action === "join") {
      method(request, "POST");
      const existingToken = voterToken(request);
      if (!existingToken) {
        const token = newVoterToken();
        return json({ status: "cookie_set" }, 202, { "Set-Cookie": voterCookie(token) });
      }
      if (!await consumeRateLimit(env.DB, "join-ip", requestIp(request), 30, 60 * 60 * 1000)) {
        throw new ServerError(429, "join_limit", "Try joining again later.");
      }
      const input = await body(request);
      if (!await verifyTurnstile(request, string(input.token), env.TURNSTILE_SECRET_KEY, "join", import.meta.env.DEV)) {
        throw new ServerError(403, "turnstile_failed", "The verification failed. Try again.");
      }
      return json(await joinPoll(env.DB, id, input.name, existingToken));
    }
    if (parts.length === 3 && action === "me") {
      method(request, "GET");
      return json(await getVoterState(env.DB, id, voterToken(request)));
    }
    if (parts.length === 3 && action === "events") {
      method(request, "POST");
      return json(await recordVoterEvent(env.DB, id, voterToken(request), await body(request) as VoterEvent));
    }
    if (parts.length === 3 && action === "report") {
      method(request, "POST");
      await submitReport(env.DB, id, (await body(request)).reason, requestIp(request));
      return json({ ok: true });
    }
  }
  if (root === "shared" && id && parts.length === 2) {
    method(request, "GET");
    return json(await getSharedResults(env.DB, id));
  }
  if (root === "media" && id && parts.length === 2) {
    method(request, "GET", "HEAD");
    const auth = await authenticate(env.DB, request);
    const response = await serveMedia(env.DB, env.MEDIA, request, id, auth?.accountId ?? null);
    if (response.status === 404 && m !== "HEAD") {
      return json({ error: { code: "media_not_found", message: "This media was not found." } }, 404, response.headers);
    }
    return response;
  }
  if (root === "dev" && id === "mail" && parts.length === 2) {
    method(request, "GET");
    const mail = await readDevMail(env.DB, request, import.meta.env.DEV);
    if (!mail) throw new ServerError(404, "not_found", "This endpoint was not found.");
    return json(mail);
  }
  if (root === "owner") {
    if (parts.length === 1) {
      method(request, "GET");
      const auth = await owner(request);
      const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new ServerError(400, "invalid_offset", "Enter a non-negative offset.");
      return json(await getOwnerOverview(env.DB, auth, (env as typeof env & { OWNER_EMAILS?: string }).OWNER_EMAILS, offset));
    }
    if (id === "polls" && action && sub === "takedown" && parts.length === 4) {
      method(request, "POST");
      await owner(request);
      await takeDownPoll(env.DB, action);
      return json({ ok: true });
    }
    if (id === "accounts" && action && sub === "block" && parts.length === 4) {
      method(request, "POST");
      const auth = await owner(request);
      if (!await blockAccount(env.DB, auth, (env as typeof env & { OWNER_EMAILS?: string }).OWNER_EMAILS, action)) throw new ServerError(404, "account_not_found", "This account was not found.");
      return json({ ok: true });
    }
  }
  throw new ServerError(404, "not_found", "This endpoint was not found.");
}

export const ALL: APIRoute = async ({ request, params }) => {
  try {
    return await route(request, params.path ?? "");
  } catch (error) {
    if (error instanceof ServerError) {
      const headers = error.status === 405 && error.details && typeof error.details === "object" && "allowed" in error.details
        ? { Allow: (error.details.allowed as string[]).join(", ") } : undefined;
      return json({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } }, error.status, headers);
    }
    console.error("API request failed", error);
    return json({ error: { code: "internal_error", message: "Something went wrong. Try again." } }, 500);
  }
};
