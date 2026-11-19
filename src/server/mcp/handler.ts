import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticate } from "../auth.js";
import { oauthGrantIdFromToken, oauthGrantIsActive } from "../oauth-grants.js";
import { createPairpollMcpServer } from "./tools.js";

function jsonError(status: number, code: string, message: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: responseHeaders });
}

export async function handleMcpRequest(db: D1Database, request: Request): Promise<Response> {
  try {
    const auth = await authenticate(db, request);
    if (!auth || auth.kind !== "api_key") {
      return jsonError(401, "authentication_required", "Use a Pairpoll API key.", {
        "WWW-Authenticate": "Bearer",
      });
    }

    return await handleAuthenticatedMcpRequest(db, request, auth.accountId);
  } catch {
    return jsonError(500, "internal_error", "Something went wrong. Try again.");
  }
}

export async function handleAuthenticatedMcpRequest(
  db: D1Database,
  request: Request,
  accountId: string,
  oauthToken?: string,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return jsonError(403, "invalid_origin", "Send this request from the same origin.");
  }
  const active = await db.prepare(`
    SELECT id FROM accounts WHERE id = ? AND blocked_at IS NULL AND deleting_at IS NULL
  `).bind(accountId).first();
  if (!active) {
    const metadata = new URL("/.well-known/oauth-protected-resource/mcp", request.url).href;
    return jsonError(401, "authentication_required", "Sign in to Pairpoll again.", {
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="mcp:tools"`,
    });
  }
  const oauthGrantId = oauthToken ? oauthGrantIdFromToken(oauthToken, accountId) : null;
  if (oauthToken && (!oauthGrantId || !await oauthGrantIsActive(db, accountId, oauthGrantId))) {
    const metadata = new URL("/.well-known/oauth-protected-resource/mcp", request.url).href;
    return jsonError(401, "authentication_required", "Sign in to Pairpoll again.", {
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="mcp:tools"`,
    });
  }

  const handler = createMcpHandler(() => createPairpollMcpServer(db, accountId, request.url));
  return handler.fetch(request);
}
