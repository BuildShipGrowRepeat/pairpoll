import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// Raw Markdown index of the docs: /docs.md
export const GET: APIRoute = async ({ site }) => {
  const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);
  const lines = docs.map((doc) => `- [${doc.data.title}](${new URL(`/docs/${doc.id}.md`, site).href}): ${doc.data.description}`);
  const body = `# Pairpoll docs\n\nHow to create polls and read results from code, the command line or an AI assistant.\n\n${lines.join("\n")}\n`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
};
