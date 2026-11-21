---
seoTitle: "Free pairwise ranking tool for images and videos | Pairpoll"
description: "A free, open-source pairwise comparison tool. Upload 2 to 16 images or videos, share one link, and people pick the better of two. You get a ranking."
title: "A pairwise ranking tool for images and videos"
name: "Pairwise ranking"
blurb: "Rank images or videos by comparing two at a time."
lead: "Upload 2 to 16 images or videos and share one link. Each person picks the better of two until their top list is settled. You get every voter's list and one overall ranking. Pairpoll is free and open source."
order: 9
demo: photos
demoQuestion: "Which photo do you like more?"
picture: "pairwise-tool"
---

## What a pairwise ranking tool does

Pairwise ranking, also called pairwise comparison, means judging items two at a time instead of sorting a whole list at once. Picking one of two is quick, even when the list is long. The tool turns those picks into a ranking.

Many free pairwise tools rank a list of words for one person, such as tasks, ideas or names. Pairpoll ranks images and videos, and many people can vote in the same poll through one link.

## How Pairpoll turns picks into a ranking

1. You upload 2 to 16 images or 2 to 16 videos and write the question voters see.
2. You choose whether each voter settles a top 1, 3 or 5.
3. Each voter gets the items in their own shuffled order and runs a knockout. The item they pick moves on to the next round until the winner is clear. A few extra picks settle the other places in their top list.
4. Each voter ends with their own top list. Pairpoll adds the lists up into one overall ranking.

The overall ranking gives points for each place. With a top 3, first place gets 3 points, second 2 and third 1. If two items have the same points, the one with more first places ranks higher. If that is equal too, they share the place. Only voters who finish count.

## How many picks each voter makes

A knockout needs far fewer picks than comparing every pair:

| Items | Top 1 | Top 3 | Top 5 | Every pair |
| --- | --- | --- | --- | --- |
| 4 | 3 | 4 | 4 | 6 |
| 8 | 7 | 8 | 11 | 28 |
| 16 | 15 | 16 | 19 | 120 |

Fewer picks make a poll easier to finish, especially on a phone.

## Knockout or every pair: which one you need

Pairpoll does not compare every item with every other item. That keeps polls short, and it has a cost. Each voter's list covers only their top places, not the full order. Second place goes to the item that lost the final, so if a voter's two favourites meet in the first round, one of them leaves early. Because the order is shuffled for every voter, this evens out as more people vote. One voter's list is still not a complete ranking.

A tool that shows every pair, often called a round robin, is the better choice when:

- you need a full order of every item, not only the top few
- you are ranking for yourself or with one or two people, and many picks are fine
- your items are text, such as tasks, features or names
- you need weights or scores for a formal decision

Pairpoll is the better choice when:

- your items are images or videos
- many people should vote through one link, without an account
- you want each voter's top list as well as the overall ranking
- you only need to know which few options are strongest

## Free and open source

Pairpoll is free to use. The [code is on GitHub](https://github.com/BuildShipGrowRepeat/pairpoll) under the MIT licence. Voters type a name and start. Only the person who creates the poll signs in, with an email link. Polls, files and votes are deleted 30 days after a poll is created.

AI agents can create polls and read results through a REST API, a command-line tool or an MCP server. See [Pairpoll for AI agents](/docs/agents).

## Limits

- 2 to 16 items in a poll, all images or all videos.
- Images: JPEG, PNG, WebP or GIF up to 10 MB each. Videos: MP4 or WebM up to 30 MB each.
- Up to 200 voters in a poll. The default limit is 50.
- No text-only options and no comments from voters.

## Related

- [How voting in pairs works](/guides/how-voting-in-pairs-works)
- [The paired comparison method](/guides/paired-comparison-method): comparing every pair by hand.
- [How many voters do you need?](/guides/how-many-voters-do-you-need)
- [PollUnit](/alternatives/pollunit) and [OpinionX](/alternatives/opinionx) also run pairwise votes. Each page compares that tool with Pairpoll.
