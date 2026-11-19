const BASE = "https://pairpoll.invalid";

/**
 * Returns `value` as a path on this site, or `fallback` when it would leave the site.
 * Parses the way a browser does, so `/\host`, `//host` and tab tricks are caught.
 */
export function localPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value?.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  const path = url.pathname + url.search + url.hash;
  return url.origin === BASE && !path.startsWith("//") ? path : fallback;
}
