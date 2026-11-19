---
seoTitle: "Pick the best AI-generated image with real votes | Pairpoll"
description: "Generated a dozen AI images and can't choose? Put up to 16 in a free poll, send one link, and people pick the better of two until the best one is clear."
title: "Let people choose the best AI-generated image"
name: "AI images"
blurb: "Pick the best of your AI-generated variants."
lead: "Image tools make it easy to generate a dozen versions. Choosing one is harder. Put up to 16 in a poll and send one link, and each person picks the better of two until their top list is settled."
order: 13
demo: thumbnails
demoQuestion: "Which image would you use?"
---

## When this helps

You've generated a set of variants for a cover, a header, an ad or an illustration, and several of them are good. You've looked at them so long that they all blur together. The people the image is for haven't seen any of them yet, so ask them.

## How it works

1. Generate your variants and save them to one folder. Pairpoll takes JPEG, PNG, WebP or GIF, up to 10 MB each.
2. Create a poll in the browser, or let your agent do it from the folder with the command line tool:

   ```sh
   pairpoll create ./out --question "Which image would you use?" --top 3 --open
   ```

3. Send the voter link to your audience, team or client. Voters type a name and start, without signing up.
4. Open the results to see the overall ranking and each voter's top list.

If an AI assistant made the images, it can also create the poll and read the results for you. See [Let your AI assistant run the poll](/for/ai-agents).

## Why ask people instead of a model

A model can score an image for sharpness or match it to a prompt. Whether it's the right image for your audience is a matter of taste, and the people you're making it for are the best judges of that. Picking one of two is quick, so voters can get through a long set.

## What it doesn't do

Pairpoll doesn't generate images, and it doesn't import them from a web address. You upload the files you already have. It also doesn't collect comments, so it shows which image people prefer but not why.

## Tips

- Cull first. Drop the variants with broken hands, wrong text or artefacts before the poll.
- Keep the prompt the same and change one thing, such as the style, the colour or the framing. Then the result tells you what to ask for next time.
- Show each image at the size people will see it. A header looks different at full width than a thumbnail does in a feed.

## Common questions

### How many images can I compare?

From 2 to 16 in one poll.

### Can I see who picked which image?

Yes. You see each voter's name and top list. Voters see only their own list at the end.

### Is it free?

Yes. Pairpoll is free and open source. Polls, files and votes are deleted 30 days after a poll is created.

## Related

- [Let your AI assistant run the poll](/for/ai-agents)
- [CLI reference](/docs/cli)
- [Designs](/for/designs)
