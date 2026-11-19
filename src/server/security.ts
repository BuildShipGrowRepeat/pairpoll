const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
}

export function readCookie(request: Request, name: string): string | null {
  for (const cookie of (request.headers.get("Cookie") ?? "").split(";")) {
    const entry = cookie.trimStart();
    if (entry.startsWith(`${name}=`)) return entry.slice(name.length + 1);
  }
  return null;
}

export function readBearer(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  return /^Bearer ([^\s]+)$/i.exec(header)?.[1] ?? null;
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

export function requestIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "local";
}

export async function consumeRateLimit(
  db: D1Database,
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const identifierHash = await hashToken(identifier);
  const row = await db.prepare(`
    INSERT INTO rate_limits (scope, identifier_hash, hits, expires_at)
    VALUES (?1, ?2, 1, ?3)
    ON CONFLICT (scope, identifier_hash) DO UPDATE SET
      hits = CASE WHEN expires_at <= ?4 THEN 1 ELSE hits + 1 END,
      expires_at = CASE WHEN expires_at <= ?4 THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at <= ?4 OR hits < ?5
    RETURNING hits
  `).bind(scope, identifierHash, now + windowMs, now, limit).first();
  return row !== null;
}

export function isLocalDevelopment(request: Request, dev: boolean): boolean {
  return dev && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
}

const TEST_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";

export async function verifyTurnstile(
  request: Request,
  token: string,
  secret: string,
  action: string,
  dev = false,
): Promise<boolean> {
  if (!secret || !token || token.length > 2048) return false;

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret,
        response: token,
        ...(requestIp(request) === "local" ? {} : { remoteip: requestIp(request) }),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result: { success?: boolean; hostname?: string; action?: string } = await response.json();
    if (result.success !== true) return false;

    // Cloudflare's dummy secret returns a fixed hostname and omits action.
    if (isLocalDevelopment(request, dev) && secret === TEST_TURNSTILE_SECRET) {
      return result.hostname === "example.com" && result.action === undefined;
    }
    return result.hostname === new URL(request.url).hostname && result.action === action;
  } catch {
    return false;
  }
}
