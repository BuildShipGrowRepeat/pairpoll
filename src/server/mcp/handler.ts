import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticate } from "../auth.js";
import { createPairpollMcpServer } from "./tools.js";

function jsonError(status: number, code: string, message: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: responseHeaders });
}

export async function handleMcpRequest(db: D1Database, request: Request): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return jsonError(403, "invalid_origin", "Send this request from the same origin.");
  }

  try {
    const auth = await authenticate(db, request);
    if (!auth || auth.kind !== "api_key") {
      return jsonError(401, "authentication_required", "Use a Pairpoll API key.", {
        "WWW-Authenticate": "Bearer",
      });
    }

    const handler = createMcpHandler(() => createPairpollMcpServer(db, auth.accountId, request.url));
    return await handler.fetch(request);
  } catch {
    return jsonError(500, "internal_error", "Something went wrong. Try again.");
  }
}
