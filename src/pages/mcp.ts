import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleMcpRequest } from "../server/mcp/handler.js";

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleMcpRequest(env.DB, request);
