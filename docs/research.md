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
- YouTube's own title and thumbnail A/B test ("test and compare") runs on live traffic, in YouTube Studio, for your own videos only: https://support.google.com/youtube/answer/13861714

**What none of them combine:** voting in pairs across many uploaded videos, one play per video, a top list per voter, and free creation by an AI agent for your own audience.

## Search terms (Ahrefs, US monthly / global monthly / difficulty 0-100)

| Term | US | Global | Difficulty | Fit |
| --- | --- | --- | --- | --- |
| poll with pictures / picture poll / image poll | 50 / 50 / 40 | 80 / 60 / 100 | 4 / 4 / 0 | High, home page |
| this or that polls / this or that poll | 150 / 80 | 200 / 100 | 0 / 1 | Medium, many want question ideas |
| thumbnail rater | 150 | 700 | 2 | High; rivals are AI raters, ours uses real votes |
| youtube thumbnail a/b testing | 100 | 150 | 10 | Medium |
| pairwise ranking / pairwise comparison tool | 90 / 40 | 450 / 90 | 5 / 0 | High, also suits developers and agents |
| creative testing / ad creative testing | 400 / 200 | 900 / 450 | 12 / 8 | Partial; most mean paid live tests |
| preference testing | 200 | 250 | 0 | Medium |
| bracket maker with pictures | 200 | 250 | 50 | Medium |

Wrong intent, do not target: bracket maker (sports), vote images (clipart), rank my photos and rate my photos (dating), thumbnail tester (preview mockups), tier list maker, generic poll maker.

Words that carry search volume: poll, vote, this or that, rater, test, ranking, pairwise.

AI assistants answering "let friends vote between images" cite small dedicated tool pages, Product Hunt listings and plain-text docs. So: one clear page per use, plain-text docs, `llms.txt`.
