import { defineMiddleware } from "astro:middleware";

// Pages rendered on request carry account, results or voter state: keep them out of
// browser caches, and let no other site frame them (the CLI approval page above all).
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (!context.isPrerendered && response.headers.get("Content-Type")?.startsWith("text/html")) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return response;
});
