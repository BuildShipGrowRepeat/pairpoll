import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// Public, indexable pages only. Poll, app, API and error pages are left out on purpose.
export const GET: APIRoute = async ({ site }) => {
  const [uses, alternatives, guides, docs] = await Promise.all([
    getCollection("uses"),
    getCollection("alternatives"),
    getCollection("guides"),
    getCollection("docs"),
  ]);
  const paths = [
    "/",
    "/about",
    "/feedback",
    "/terms",
    "/privacy",
    "/for",
    ...uses.map((entry) => `/for/${entry.id}`),
    "/alternatives",
    ...alternatives.map((entry) => `/alternatives/${entry.id}`),
    "/guides",
    ...guides.map((entry) => `/guides/${entry.id}`),
    "/docs",
    ...docs.map((entry) => `/docs/${entry.id}`),
  ];
  const urls = paths.map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
