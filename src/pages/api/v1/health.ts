import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = () => Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
export const ALL: APIRoute = () => Response.json(
  { error: { code: "method_not_allowed", message: "Use GET.", details: { allowed: ["GET"] } } },
  { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } },
);
