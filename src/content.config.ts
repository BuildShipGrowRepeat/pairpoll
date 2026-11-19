import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { demoSetNames } from "./components/demo/sets";

// Marketing and docs content. One Markdown file per page; the file name is the URL slug.
// Every page needs a search title (under about 60 characters) and a description (about 150).
const page = {
  seoTitle: z.string().max(70),
  description: z.string().min(50).max(170),
  title: z.string(),
};

// /for/<slug>: one use case. `name` is the short label in lists; `blurb` is one line for hubs.
const uses = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/uses" }),
  schema: z.object({
    ...page,
    name: z.string(),
    blurb: z.string(),
    lead: z.string(),
    order: z.number(),
    demo: z.enum(demoSetNames),
    demoQuestion: z.string().optional(),
  }),
});

// /alternatives/<slug>: a free alternative to another tool. Every fact needs a source on the
// tool's own site (see docs/research.md); `checked` is the day the facts were last checked.
const alternatives = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/alternatives" }),
  schema: z.object({
    ...page,
    tool: z.string(),
    blurb: z.string(),
    lead: z.string(),
    checked: z.coerce.date(),
    order: z.number(),
    comparison: z
      .array(
        z.object({
          topic: z.string(),
          them: z.string(),
          pairpoll: z.string(),
          source: z.url(),
        }),
      )
      .min(1),
  }),
});

// /guides/<slug>: how-to articles.
const guides = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/guides" }),
  schema: z.object({
    ...page,
    blurb: z.string(),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    order: z.number(),
  }),
});

// /docs/<slug>, also served as raw Markdown at /docs/<slug>.md. `nav` is the side-menu label.
const docs = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/docs" }),
  schema: z.object({
    ...page,
    nav: z.string(),
    order: z.number(),
  }),
});

export const collections = { uses, alternatives, guides, docs };
