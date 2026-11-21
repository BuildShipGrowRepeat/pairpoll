---
seoTitle: "Paired comparison method, with a worked example | Pairpoll"
description: "The paired comparison method step by step: compare every pair of options, tally the wins, and see how fast the pairs grow as the list gets longer."
title: "The paired comparison method"
blurb: "Rank options by comparing every pair: how to do it by hand, and when it gets too long."
published: 2026-11-19
order: 6
picture: "paired-method"
---

The paired comparison method ranks a list of options by comparing them two at a time. You compare every option with every other option, note the winner of each pair, and count the wins. The option with the most wins comes first. It's useful when a list is hard to sort at once, because one choice between two is easy.

## How to do it by hand

Say a team is choosing between five logo concepts: A, B, C, D and E.

1. List every pair: A-B, A-C, A-D, A-E, B-C, B-D, B-E, C-D, C-E and D-E. That's 10 pairs.
2. For each pair, decide which option is better and write down the winner.
3. Count each option's wins.
4. Sort the options by wins.

<div class="article-picture all-pairs-picture" aria-hidden="true">
  <span>A–B</span><span>A–C</span><span>A–D</span><span>A–E</span><span>B–C</span>
  <span>B–D</span><span>B–E</span><span>C–D</span><span>C–E</span><span>D–E</span>
</div>

A grid makes this easier to track. Each cell holds the winner of the pair in its row and column, so you fill only the half above the diagonal:

| | B | C | D | E |
| --- | --- | --- | --- | --- |
| A | A | C | A | A |
| B | | C | B | E |
| C | | | C | C |
| D | | | | E |

Now count the wins:

| Option | Wins |
| --- | --- |
| C | 4 |
| A | 3 |
| E | 2 |
| B | 1 |
| D | 0 |

C beat every other option, so it comes first. With a group, each person fills in their own grid, and you add up everyone's wins.

## How many comparisons it takes

Every option meets every other option once, so a list of n options has n × (n − 1) ÷ 2 pairs:

| Options | Pairs |
| --- | --- |
| 3 | 3 |
| 5 | 10 |
| 8 | 28 |
| 10 | 45 |
| 16 | 120 |

Doubling the list roughly quadruples the work: 8 options take 28 decisions per person, and 16 take 120.

## When it breaks down

- **Long lists.** Ten options already mean 45 decisions per person, a lot to ask of anyone.
- **Many people.** Each person has to make every comparison, and someone has to collect and add up all the grids.
- **Ties.** Two options can end with the same number of wins. You can break the tie by looking at who won when those two met, but with three or more tied options the pairs can go in a circle: A beats B, B beats C and C beats A.
- **Scores without strength.** A win is a win. The method doesn't show whether A was far better than B or only just.

## A knockout as the shortcut

A knockout skips most pairs. Options meet in rounds, the one picked moves on, and the winner is clear after one pick fewer than the number of options: 15 picks for 16 options instead of 120. A few extra picks settle second and third place.

The cost is that a knockout doesn't compare every pair. An option that meets a strong rival early leaves early, even if it would beat everything else. If you shuffle the order for each person, that evens out across a group, but one person's result is not a full ranking. [Knockout or every pair](/for/pairwise-ranking#knockout-or-every-pair-which-one-you-need) covers when each one fits.

## Doing it with a group in Pairpoll

Pairpoll runs the knockout version for images and videos. You upload 2 to 16 options and share one link. Each person sees two at a time and picks one until their top 1, 3 or 5 is settled, in their own shuffled order. Pairpoll adds everyone's lists into one overall ranking, with points for each place.

Pairpoll doesn't do the full paired comparison, and it doesn't take text options. For a full grid of text options, a spreadsheet or a tool that shows every pair fits better.

## Related

- [Pairwise comparison: how voting in pairs works](/guides/how-voting-in-pairs-works)
- [A pairwise ranking tool for images and videos](/for/pairwise-ranking)
- [How many voters do you need?](/guides/how-many-voters-do-you-need)
- [MaxDiff vs ranking questions vs pairwise comparison](/guides/maxdiff-vs-pairwise-comparison)
