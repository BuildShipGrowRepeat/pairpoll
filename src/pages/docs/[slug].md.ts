import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

// Raw Markdown copy of each docs page, for agents: /docs/<slug>.md
export const getStaticPaths = (async () => {
  const docs = await getCollection("docs");
  return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const { doc } = props as { doc: CollectionEntry<"docs"> };
  return new Response(`# ${doc.data.title}\n\n${doc.body?.trim() ?? ""}\n`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
