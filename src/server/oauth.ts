import {
  AuthorizationError,
  getOAuthApi,
  GrantType,
  insufficientScope,
  OAuthError,
  OAuthProvider,
  type AuthRequest,
  type OAuthHelpers,
  type OAuthProviderOptions,
  type OAuthResourceAuth,
} from "@cloudflare/workers-oauth-provider";
import { authenticate } from "./auth.js";
import { handleAuthenticatedMcpRequest } from "./mcp/handler.js";
import { MCP_SCOPE } from "./mcp/scope.js";
import {
  acknowledgeOAuthAccountCleanup,
  acknowledgeOAuthGrantCleanup,
  claimOAuthAuthorizationCode,
  enqueueOAuthAccountCleanup,
  markOAuthGrantsRevoked,
  oauthGrantIsActive,
  revokedOAuthGrantIds,
  validOAuthGrantId,
} from "./oauth-grants.js";
import { consumeRateLimit, requestIp } from "./security.js";

export { MCP_SCOPE };
const HOUR = 60 * 60 * 1000;
const TOKEN_BODY_LIMIT = 8 * 1024;
// Hosted connectors (Claude, ChatGPT) refresh many users' tokens from a few shared addresses.
const TOKEN_RATE_LIMIT = 3000;
const NOT_FOUND_HANDLER: ExportedHandler<Env> = {
  fetch: () => new Response("Not found", { status: 404 }),
};

export interface OAuthGrantProps {
  accountId: string;
  access: "oauth" | "api_key";
}

export interface ConnectedApp {
  id: string;
  name: string;
  redirectHost: string;
  connectedAt: number;
}

function resource(origin: string): string {
  return `${origin}/mcp`;
}

function providerOptions(origin: string, defaultHandler: ExportedHandler<Env>): OAuthProviderOptions<Env> {
  const mcpResource = resource(origin);
  return {
    apiRoute: "/mcp",
    apiHandler: {
      async fetch(request, env, context) {
        const oauthContext = context as ExecutionContext & {
          props: OAuthGrantProps;
          auth: OAuthResourceAuth;
        };
        if (oauthContext.props.access === "oauth" && !oauthContext.auth.scope.includes(MCP_SCOPE)) {
          return insufficientScope(oauthContext.auth, [MCP_SCOPE]);
        }
        return handleAuthenticatedMcpRequest(
          env.DB,
          request,
          oauthContext.props.accountId,
          oauthContext.props.access === "oauth" ? oauthContext.auth.token : undefined,
        );
      },
    },
    defaultHandler,
    authorizeEndpoint: "/oauth/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: [MCP_SCOPE],
    requiredScopes: [MCP_SCOPE],
    resourceMetadata: {
      resource: mcpResource,
      authorization_servers: [origin],
      resource_name: "Pairpoll MCP",
    },
    clientIdMetadataDocumentEnabled: true,
    async resolveExternalToken({ request, env }) {
      const auth = await authenticate(env.DB, request);
      if (!auth || auth.kind !== "api_key") return null;
      return {
        props: { accountId: auth.accountId, access: "api_key" } satisfies OAuthGrantProps,
        audience: mcpResource,
      };
    },
    async tokenExchangeCallback({ grantType, grantId, userId, env }) {
      const active = await env.DB.prepare(`
        SELECT id FROM accounts WHERE id = ? AND blocked_at IS NULL AND deleting_at IS NULL
      `).bind(userId).first();
      if (!active) {
        throw new OAuthError("invalid_grant", {
          description: "This Pairpoll account cannot authorize apps.",
        });
      }
      const grantAllowed = grantType === GrantType.AUTHORIZATION_CODE
        ? await claimOAuthAuthorizationCode(env.DB, userId, grantId)
        : await oauthGrantIsActive(env.DB, userId, grantId);
      if (!grantAllowed) {
        throw new OAuthError("invalid_grant", {
          description: "This Pairpoll authorization grant is no longer valid.",
        });
      }
    },
  };
}

export function oauthHelpers(env: Env, origin: string): OAuthHelpers {
  return getOAuthApi(providerOptions(origin, NOT_FOUND_HANDLER), env);
}

export function requireS256(request: AuthRequest): void {
  if (request.codeChallenge && request.codeChallengeMethod === "S256") return;
  throw new AuthorizationError("invalid_request", {
    description: "Use the authorization code flow with PKCE S256.",
    redirectUri: request.redirectUri,
    state: request.state,
    issuer: request.issuer,
  });
}

async function limitedTokenRequest(request: Request): Promise<Request | null> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > TOKEN_BODY_LIMIT)) return null;
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > TOKEN_BODY_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: body.buffer,
  });
}

export async function handleOAuthRequest(
  request: Request,
  env: Env,
  context: ExecutionContext,
  defaultHandler: ExportedHandler<Env>,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (request.method === "POST" && pathname === "/oauth/register") {
    const allowed = await consumeRateLimit(env.DB, "oauth-register", requestIp(request), 30, HOUR);
    if (!allowed) {
      return Response.json({ error: "temporarily_unavailable", error_description: "Try registering again later." }, {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "3600" },
      });
    }
  }
  if (request.method === "POST" && pathname === "/oauth/token") {
    const allowed = await consumeRateLimit(env.DB, "oauth-token", requestIp(request), TOKEN_RATE_LIMIT, HOUR);
    if (!allowed) {
      return Response.json({ error: "temporarily_unavailable", error_description: "Try the token request again later." }, {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "3600" },
      });
    }
    const limited = await limitedTokenRequest(request);
    if (!limited) {
      return Response.json({ error: "invalid_request", error_description: "Send a token request no larger than 8 KB." }, {
        status: 413,
        headers: { "Cache-Control": "no-store" },
      });
    }
    request = limited;
  }
  if (pathname.startsWith("/mcp/")) {
    return defaultHandler.fetch!(
      request as Request<unknown, IncomingRequestCfProperties>,
      env,
      context,
    );
  }
  return new OAuthProvider(providerOptions(new URL(request.url).origin, defaultHandler)).fetch(request, env, context);
}

export async function consumeAuthorizationRateLimit(db: D1Database, request: Request): Promise<boolean> {
  return consumeRateLimit(db, "oauth-authorize", requestIp(request), 30, HOUR);
}

export async function listConnectedApps(env: Env, origin: string, accountId: string): Promise<ConnectedApp[]> {
  const oauth = oauthHelpers(env, origin);
  const revoked = await revokedOAuthGrantIds(env.DB, accountId);
  const apps: ConnectedApp[] = [];
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(accountId, { limit: 100, cursor });
    for (const grant of page.items) {
      if (revoked.has(grant.id)) continue;
      const metadata = grant.metadata as { clientName?: unknown; redirectHost?: unknown } | null;
      apps.push({
        id: grant.id,
        name: typeof metadata?.clientName === "string" ? metadata.clientName : "Connected app",
        redirectHost: typeof metadata?.redirectHost === "string" ? metadata.redirectHost : "Unknown redirect",
        connectedAt: grant.createdAt * 1000,
      });
    }
    cursor = page.cursor;
  } while (cursor);
  return apps.sort((a, b) => b.connectedAt - a.connectedAt);
}

export async function revokeConnectedApp(
  env: Env,
  origin: string,
  accountId: string,
  grantId: string,
): Promise<boolean> {
  if (!validOAuthGrantId(grantId)) return false;
  const oauth = oauthHelpers(env, origin);
  let found = false;
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(accountId, { limit: 100, cursor });
    found ||= page.items.some((grant) => grant.id === grantId);
    cursor = found ? undefined : page.cursor;
  } while (cursor);
  if (!found) return false;
  await markOAuthGrantsRevoked(env.DB, accountId, [grantId]);
  try {
    await oauth.revokeGrant(grantId, accountId);
    await acknowledgeOAuthGrantCleanup(env.DB, accountId, grantId);
  } catch (error) {
    console.error("OAuth grant KV revocation will be retried", error);
  }
  return true;
}

export async function revokeAllConnectedApps(env: Env, origin: string, accountId: string): Promise<void> {
  await enqueueOAuthAccountCleanup(env.DB, accountId);
  const oauth = oauthHelpers(env, origin);
  const grants: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(accountId, { limit: 100, cursor });
    grants.push(...page.items.map((grant) => grant.id));
    cursor = page.cursor;
  } while (cursor);
  const { results: pending } = await env.DB.prepare(`
    SELECT grant_id AS grantId FROM oauth_grant_states
    WHERE account_id = ? AND cleanup_pending = 1
  `).bind(accountId).all<{ grantId: string }>();
  const grantIds = [...new Set([...grants, ...pending.map(({ grantId }) => grantId)])];
  await markOAuthGrantsRevoked(env.DB, accountId, grantIds);
  for (const grantId of grantIds) {
    await oauth.revokeGrant(grantId, accountId);
    await acknowledgeOAuthGrantCleanup(env.DB, accountId, grantId);
  }
  const account = await env.DB.prepare(`
    SELECT deleting_at AS deletingAt FROM accounts WHERE id = ?
  `).bind(accountId).first<{ deletingAt: number | null }>();
  if (!account || account.deletingAt !== null) {
    await env.DB.prepare(`
      DELETE FROM oauth_grant_states WHERE account_id = ? AND cleanup_pending = 0
    `).bind(accountId).run();
  }
  await acknowledgeOAuthAccountCleanup(env.DB, accountId);
}

export async function revokePendingOAuthGrants(env: Env, origin: string): Promise<void> {
  const { results } = await env.DB.prepare(`
    SELECT account_id AS accountId, grant_id AS grantId
    FROM oauth_grant_states WHERE cleanup_pending = 1 LIMIT 100
  `).all<{ accountId: string; grantId: string }>();
  const oauth = oauthHelpers(env, origin);
  for (const { accountId, grantId } of results) {
    try {
      await oauth.revokeGrant(grantId, accountId);
      await acknowledgeOAuthGrantCleanup(env.DB, accountId, grantId);
    } catch (error) {
      console.error("OAuth grant KV cleanup will be retried", error);
    }
  }
}

export async function revokePendingOAuthAccounts(env: Env, origin: string): Promise<void> {
  const { results } = await env.DB.prepare(`
    SELECT account_id AS accountId FROM oauth_account_cleanup LIMIT 100
  `).all<{ accountId: string }>();
  for (const { accountId } of results) {
    try {
      await revokeAllConnectedApps(env, origin, accountId);
    } catch (error) {
      console.error("OAuth account KV cleanup will be retried", error);
    }
  }
}
