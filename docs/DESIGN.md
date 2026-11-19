# Pairpoll design

## Idea

Editors pick the best frame on a contact sheet by circling it with a red grease pencil. Pairpoll is that sheet: calm white and lavender-grey surfaces, violet-black ink, and one loud thing, the hand-drawn red loop that marks a pick. The loop appears in the logo, around a picked item and around first place. Use it for nothing else.

## Tokens (`src/styles/tokens.css`)

- Colour: `--paper` white page, `--sheet` / `--sheet-deep` panels and empty frames, `--ink` text and primary buttons, `--ink-soft` secondary text, `--ink-faint` placeholders, `--line` dividers, `--line-strong` input borders, `--marker` the loop only (never text: use `--marker-ink` if red text is needed), `--danger`, `--ok`, `--warn` with `-wash` backgrounds for status.
- Type: Schibsted Grotesk only (variable 400 to 900, SIL OFL, `public/fonts`). 400 body, 600 labels and buttons, 800 headings. Sizes `--text-sm` to `--text-3xl`; body 17px; sentence case everywhere; no all-caps labels.
- Space: `--s-1` (4px) to `--s-9` (96px). Page width `--page`, text width `--measure`, side padding `--gutter`.
- Radius by role: `--r-frame` media, `--r-control` buttons and inputs, `--r-panel` cards and panels, `--r-pill` badges.
- Motion: `--quick` for press and hover feedback, `--draw` for the pick loop. Both drop to 0 with reduced motion. No idle, scroll or entrance animation.

## Components (`src/components`, classes in `src/styles/components.css`)

Astro components render shared classes, so client-side TypeScript can build the same markup.

| Component | Class | Use |
| --- | --- | --- |
| `Button` | `.btn--primary/secondary/quiet/danger`, `--sm/--lg`, `--block` | One primary per view. Name the action ("Open poll"), keep the name through the flow. |
| `Field` | `.field`, `.input`, `.field-hint`, `.field-error` | Label above, hint under the label, error under the control. Client code fills `.field-error` and sets `aria-invalid="true"`. |
| (markup) | `.segmented`, `.check` | Exclusive choices (top size, kind) and checkboxes. See `/design`. |
| `Card` | `.card`, `.card--sheet` | Group related content in the app. Do not wrap every section in a card. |
| `DuelCard` | `.duel`, `.duel-pair`, `.duel-card`, `.duel-loop`, `.is-picked`, `.is-passed` | One side of a pair. Images: the card is the button. Videos: a pick button under the video. Stacks below 28rem of width; add `.duel--portrait` for tall media. |
| `RankingList` | `.rank`, `.rank-item` | Results. Shared places repeat the number; place 1 gets the loop. |
| `Badge` | `.badge--live/done/warn/danger` | Poll and voter status: Draft, Open, Closed, Finished. |
| `Notice` | `.notice--ok/warn/danger` | Inline messages in the page flow. Danger uses `role="alert"`. No toasts. |
| `EmptyState` | `.empty` | Say what is missing and give the next action. |
| `LinkList`, `PageIntro`, `CtaBand`, `DemoHero` | | Marketing building blocks. |
| `demo/PairDemo` | | Playable sample poll on the real knockout (`src/lib/knockout.ts`); sets in `demo/sets.ts`, art in `public/demo`. |

`/design` shows every component and state. It exists only under `npm run dev` (`src/dev/design.astro`, added in `astro.config.mjs`) and is not in the build.

## Layouts (`src/layouts`)

- `Base`: head and technical SEO. Pass `title`, `description`; `noindex` for app, poll and error pages; `jsonLd` only for facts that are true.
- `Marketing`: header, footer. `Docs`: side navigation from the docs collection plus a link to the page's Markdown.
- `App`: creator app shell, always noindex, nav Polls / API keys / Account.
- `Voter`: no site navigation, one column up to 60rem, `report` slot in the footer, always noindex.

## Rules

- Every element earns its place; when unsure, leave it out.
- Media frames show the whole picture (`object-fit: contain`); never crop what people vote on.
- Touch targets at least 44px tall; keep visible focus (`:focus-visible` ring in `--focus`).
- Contrast: body and secondary text pass WCAG AA on `--paper` and `--sheet`.
- Copy: plain, short, concrete, sentence case, no em dashes, no invented numbers or quotes. Errors say what happened and how to fix it.
- Keep JavaScript small: plain TypeScript in `<script>` tags, no UI framework.

## Content collections (`src/content.config.ts`)

One Markdown file per page in `src/content/<collection>/`; the file name is the slug. Shared fields: `seoTitle` (max 70 characters), `description` (50 to 170), `title` (the H1).

- `uses` (`/for/<slug>`): `name`, `blurb`, `lead`, `order`, `demo` (a set in `demo/sets.ts`), optional `demoQuestion`. Example: `thumbnails.md`. New art for other uses goes in `public/demo` and a new set.
- `alternatives` (`/alternatives/<slug>`): `tool`, `blurb`, `lead`, `checked` date, `order`, `comparison` rows (`topic`, `them`, `pairpoll`, `source` URL on the tool's own site). Facts only from `docs/research.md` or the vendor's site.
- `guides` (`/guides/<slug>`): `blurb`, `published`, optional `updated`, `order`.
- `docs` (`/docs/<slug>`, raw at `/docs/<slug>.md`): `nav`, `order`.

New entries appear in the hubs, the sitemap and (docs) the side navigation automatically. The home page lists the eight planned use pages by hand in `src/pages/index.astro`.
