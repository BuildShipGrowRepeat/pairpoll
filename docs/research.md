# Research for marketing pages (19 Nov 2026)

Source material for the "alternative to" pages, use pages and guides. Recheck a fact on the vendor's own page before publishing it; items marked "unverified" must not be stated as fact.

## Other tools

**PickFu**
- Accepts uploaded MP4, MOV and WebM up to 500 MB: https://www.pickfu.com/help/how-do-i-add-videos-or-audio-to-my-poll.md
- Polls for your own audience are free on every plan, up to 500 responses: https://www.pickfu.com/help/en/articles/10149684-own-audience-polls
- Formats: head to head is 2 options only; ranked is 3 to 8 options. No voting in pairs across many items: https://www.pickfu.com/help/which-poll-type-should-i-use.md
- Has an official MCP server built around its paid respondent panel; video only as YouTube, Vimeo or Wistia links there: https://www.pickfu.com/docs/integrations/mcp-server.md

**PollUnit**
- Pairwise voting with random pairs and an ELO ranking; the page describes options as free text or images (video in pairwise is unverified): https://pollunit.com/en/posts/170/pairwise-comparison
- Free plan: 40 participants, 20 files, 1 GB. Premium EUR 9 a month: https://pollunit.com/en/accounts
- Public REST API: https://pollunit.com/llms.txt

**Lyssna**
- Preference test with up to 6 options, MP4 accepted: https://www.lyssna.com/features/preference-testing/
- Video up to 100 MB; voters must watch the file once in full, then can seek: https://help.lyssna.com/en/articles/5168458-test-video-and-audio-files
- Free plan lists 15 self-recruited responses; Growth is $166 a month: https://www.lyssna.com/pricing/
- MCP server is read-only by default; creating tests is a paid-plan beta: https://help.lyssna.com/en/articles/16071364-lyssna-mcp-server

**OpinionX**
- Pair Rank: true pairwise, options can be images or GIFs, video not mentioned: https://knowledge.opinionx.co/en/articles/5866366-pair-rank
- Free: 25 participants per survey; results exportable per participant: https://www.opinionx.co/pair-rank
- No public API found (unverified absence).

**Others, for context only**
- UXtweak: MP4 up to 100 MB, up to 6 designs; free plan images only, 2 designs, 3 responses: https://uxtweak.com/preference-test-tool/ and https://uxtweak.com/pricing
- YouTube's own title and thumbnail A/B test ("test and compare") runs on live traffic, in YouTube Studio, for your own videos only: https://support.google.com/youtube/answer/16391400

**What none of them combine:** voting in pairs across many uploaded videos, one play per video, a top list per voter, and free creation by an AI agent for your own audience.

## Search terms (Ahrefs, checked 19 Nov 2026: US monthly / global monthly / difficulty 0-100)

Intent comes from the US top 8 results. A new domain can only win difficulty under about 15 with matching intent. "-" means Ahrefs has no difficulty yet.

| Page | Term | US | Global | Difficulty | Intent match |
| --- | --- | --- | --- | --- | --- |
| Home | poll with pictures / picture poll / image poll | 50 / 50 / 40 | 80 / 60 / 100 | 4 / 4 / 0 | Yes: image poll makers (onlinepoll.me DR 25, PollUnit, Opinion Stage); some stock-photo results |
| Home, new page | pairwise ranking tool / pairwise comparison tool | 70 / 40 | 150 / 90 | 0 / 0 | Yes: small free tools (DR 17 to 53) |
| Thumbnails | thumbnail rater / youtube thumbnail rater / rate my thumbnail | 150 / 50 / 50 | 700 / 150 / 150 | 2 / 2 / 4 | Yes: tool pages, all AI scorers (DR 4 to 52); ours uses real votes |
| Thumbnails | youtube thumbnail a/b testing | 100 | 150 | 10 | Partial: YouTube's live test and its help page lead |
| Ad creatives | ad creative testing / creative testing | 200 / 400 | 450 / 900 | 8 / 12 | Partial: mostly live paid tests (Meta, AppsFlyer, Kantar) |
| Ad guide | ad pre-testing / creative pre testing | 80 / 90 | 90 / 90 | 1 / 0 | Yes: pre-test guides, some low DR (16, 21) |
| Designs | preference testing / preference test | 200 / 150 | 250 / 400 | 0 / 0 | Partial: UX research guides (Maze, NN/g, UXtweak), DR 72 to 97 |
| Logos | logo survey | 30 | 150 | 0 | Partial: survey question templates (Typeform, SurveyMonkey) |
| Photos | photo poll / which photo is better | 20 / 40 | 30 / 150 | - / 16 | Partial: "which photo" results are AI photo pickers |
| Pairs guide | pairwise comparison | 1,200 | 2,800 | 5 | Yes: explainers (OpinionX blog, 1000minds, Wikipedia) |
| Voters guide | how many survey responses do i need | 40 | 60 | 8 | Not checked |
| Alternatives | lyssna alternative / pickfu alternatives / pollunit or opinionx alternative | 20 / 10 / 0 | 20 / 20 / 0 | - | Brand names carry the volume: lyssna 1,200, pickfu 1,000, opinionx 400, pollunit 350 (US) |
| Docs | poll api | 10 | 40 | 14 | Not checked |
| Other | this or that polls / this or that poll | 150 / 80 | 200 / 100 | 0 / 1 | Partial: mostly lists of question ideas |
| Other | preference testing vs a/b testing | 150 | 150 | 0 | Yes: explainers (UX Planet, UXtweak) |

No measurable volume (0 to 10 US): video poll, logo poll, compare videos, app store screenshot testing, product image testing, image poll maker.

Wrong intent, do not target: bracket maker (sports), vote images (clipart), rank my photos and rate my photos (dating), thumbnail tester and thumbnail test (preview mockups, difficulty 62 to 67), tier list maker, generic poll maker, rank images and rank videos (stock media and YouTube SEO), pairwise rankings (college hockey), ranking poll and ranked choice poll (election-style tools, difficulty 40 to 62), video testing (webcam tests), image survey (survey form builders).

Words that carry search volume: poll, vote, this or that, rater, test, ranking, pairwise.

AI assistants answering "let friends vote between images" cite small dedicated tool pages, Product Hunt listings and plain-text docs. So: one clear page per use, plain-text docs, `llms.txt`.
