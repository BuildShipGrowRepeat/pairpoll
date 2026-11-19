# Pairpoll design

## Idea

Picking between two things should feel like pressing a real key. Clean surfaces, deep blue-black ink, buttons and tiles with a solid edge that sink when pressed, and one rule for colour: blue is what you press, yellow is what has won. The yellow sticker marks a pick, first place and the last call to action. Use it for nothing else.

## Themes

Light and dark, both complete. `src/styles/tokens.css` defines every colour for light in `:root`, then repeats the dark values twice: under `@media (prefers-color-scheme: dark)` (when no choice is stored) and under `:root[data-theme="dark"]`. The half-circle button (`ThemeToggle`) in every header sets `data-theme` on `<html>` and stores it in localStorage (`pairpoll-theme`); an inline script in `Base.astro` applies it before first paint. Never write a colour outside tokens.css, except fixed white and ink on top of media (video cover, "Played" seal).

## Tokens (`src/styles/tokens.css`)

- Colour: `--page` background, `--surface` tiles, cards, inputs, `--well` trays and empty frames, `--line` borders, `--edge` the solid edge under keys and tiles, `--ink`, `--ink-soft` secondary text, `--blue` / `--blue-deep` actions and their edge, `--yellow` / `--yellow-deep` the win, `--on-yellow` text on yellow, `--green` voting open and new votes, `--error`, `--warn` with `-wash` backgrounds, `--panel*` and `--terminal` for the dark agents panel and code.
- Type: Gabarito only (variable 400 to 900, SIL OFL, `public/fonts`), falling back to ui-rounded and system-ui; `--mono` for code. 400 body, 700 labels and buttons, 900 headings. Sizes `--text-sm` to `--text-3xl`; sentence case everywhere; no all-caps labels.
- Space: `--s-1` (4px) to `--s-9` (96px). Page width `--wrap` (86rem), text width `--measure`, side padding `--gutter`.
- Radius by role: `--r-frame` media, `--r-control` buttons and inputs, `--r-tile` pair tiles, `--r-panel` cards and panels, `--r-pill` badges. `--depth` is the tile edge (6px); keys use 4px.
- Motion: `--press` (80ms) for the sink, `--quick` for hover, `--ease` and `--spring` curves.

## Motion

Only in answer to an action: press sinks a key; a pick stamps the sticker, rings the winner yellow and fades the other; a peg fills; the next pair slides in about 260ms after the pick. Video: the bar fills once, the "Played" seal stamps, the pick button wakes. Top lists land place by place; on live results rows glide to new places. No page-entry, idle, scroll or theme animation. Reduced motion makes all of it instant (a loading spinner keeps turning, slowly).

## Components (`src/components`, classes in `src/styles/components.css`)

Astro components render shared classes, so client-side TypeScript can build the same markup.

| Component | Class | Use |
| --- | --- | --- |
| `Button` | `.btn--primary/secondary/quiet/danger`, `--sm/--lg`, `--block` | One primary (blue key) per view. Name the action ("Open poll"), keep the name through the flow. |
| `Field` | `.field`, `.input`, `.field-hint`, `.field-error` | Label above, hint under the label, error under the control. Client code fills `.field-error` and sets `aria-invalid="true"`. |
| (markup) | `.segmented`, `.check` | Exclusive choices (top size, kind) and checkboxes. See `/design`. |
| `Card` | `.card`, `.card--sheet` | Group related content in the app. Do not wrap every section in a card. |
| `DuelCard` | `.duel`, `.duel-pair`, `.duel-card`, `.duel-face`, `.is-picked`, `.is-passed` | One side of a pair. Images: the tile is the button. Videos: a pick button under the video. Stacks below 28rem of width; add `.duel--portrait` for tall media. |
| `Sticker` | `.sticker` | The yellow check stamped on a pick. `sticker()` in `app/client.ts` builds the same markup. |
| (markup) | `.pegs`, `.peg.is-done/.is-now` | Progress through the pairs, one peg per pair. |
| `RankingList` | `.rank`, `.rank-item.is-first`, `.rank-bar` | Results as one list. Shared places repeat the number; first place is on yellow; the bar shows points against the leader. |
| (markup) | `.top-list`, `.top-place` | A voter's own top list on the finish screen and in the demo. |
| `Badge` | `.badge--live/done/warn/danger` | Poll and voter status: Draft, Open, Closed, Finished. |
| `Notice` | `.notice--ok/warn/danger` | Inline messages in the page flow. Danger uses `role="alert"`. No toasts. |
| `EmptyState` | `.empty` | Say what is missing and give the next action. |
| `Logo`, `Mark`, `ThemeToggle` | | Wordmark and mark take theme colours; `public/icon.svg`, the PNG icons and `og.png` are fixed-colour copies. |
| `LinkList`, `PageIntro`, `CtaBand`, `DemoHero` | | Marketing building blocks. |
| `demo/PairDemo` | | Playable sample poll on the real knockout (`src/lib/knockout.ts`); sets in `demo/sets.ts`, art in `public/demo`. |

`/design` shows every component and state. It exists only under `npm run dev` (`src/dev/design.astro`, added in `astro.config.mjs`) and is not in the build.

## Layouts (`src/layouts`)

- `Base`: head, theme script and technical SEO. Pass `title`, `description`; `noindex` for app, poll and error pages; `jsonLd` only for facts that are true.
- `Marketing`: header, footer. `Docs`: side navigation from the docs collection plus a link to the page's Markdown.
- `App`: creator app shell, always noindex, nav Polls / API keys / Account.
- `Voter`: logo and theme switch only, no site navigation, `report` slot in the footer, always noindex.

## Rules

- Every element earns its place; when unsure, leave it out.
- Media frames show the whole picture (`object-fit: contain`); never crop what people vote on.
- Touch targets at least 44px tall; keep visible focus (`:focus-visible` ring in `--focus`).
- Contrast: text passes WCAG AA on `--page`, `--surface` and `--well` in both themes.
- Copy: plain, short, concrete, sentence case, no em dashes, no invented numbers or quotes. Errors say what happened and how to fix it.
- Keep JavaScript small: plain TypeScript in `<script>` tags, no UI framework.

## Content collections (`src/content.config.ts`)

One Markdown file per page in `src/content/<collection>/`; the file name is the slug. Shared fields: `seoTitle` (max 70 characters), `description` (50 to 170), `title` (the H1).

- `uses` (`/for/<slug>`): `name`, `blurb`, `lead`, `order`, `demo` (a set in `demo/sets.ts`), optional `demoQuestion`. New art goes in `public/demo` and a new set.
- `alternatives` (`/alternatives/<slug>`): `tool`, `blurb`, `lead`, `checked` date, `order`, `comparison` rows (`topic`, `them`, `pairpoll`, `source` URL on the tool's own site). Facts only from `docs/research.md` or the vendor's site.
- `guides` (`/guides/<slug>`): `blurb`, `published`, optional `updated`, `order`.
- `docs` (`/docs/<slug>`, raw at `/docs/<slug>.md`): `nav`, `order`.

New entries appear in the hubs, the sitemap, the home page's "What you can rank" (uses) and (docs) the side navigation automatically.
