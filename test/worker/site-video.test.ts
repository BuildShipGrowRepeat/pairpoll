import { expect, it } from "vitest";
import { serveSiteVideo } from "../../src/server/site-video.js";

// Stands in for the static-assets binding, which always sends the whole file.
const assets = {
  fetch: async (url: string) => new URL(url).pathname === "/videos/a.mp4"
    ? new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), { headers: { "Content-Type": "video/mp4" } })
    : new Response(null, { status: 404 }),
} as unknown as Fetcher;

const get = (path: string, range?: string) =>
  serveSiteVideo(new Request(`https://pairpoll.test${path}`, { headers: range ? { Range: range } : {} }), assets);

it("answers a byte range on a site video with 206, as Safari requires", async () => {
  const part = await get("/videos/a.mp4", "bytes=2-5");
  expect(part.status).toBe(206);
  expect(part.headers.get("Content-Range")).toBe("bytes 2-5/8");
  expect(part.headers.get("Content-Type")).toBe("video/mp4");
  expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([2, 3, 4, 5]);

  const outside = await get("/videos/a.mp4", "bytes=8-");
  expect(outside.status).toBe(416);
  expect(outside.headers.get("Content-Range")).toBe("bytes */8");

  expect((await get("/videos/a.mp4")).status).toBe(200);
  expect((await get("/videos/missing.mp4", "bytes=0-1")).status).toBe(404);
});
