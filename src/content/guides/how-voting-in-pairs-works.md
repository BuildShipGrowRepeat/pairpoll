---
seoTitle: "Pairwise comparison: how voting in pairs works | Pairpoll"
description: "What pairwise comparison is, how Pairpoll turns picks between two items into each voter's top list and an overall ranking, and when to use it."
title: "Pairwise comparison: how voting in pairs works"
blurb: "How picks between two items become each voter's top list and an overall ranking."
published: 2026-11-19
order: 1
picture: "pairwise"
---

Voting in pairs means each person compares two items at a time and picks the one they prefer. It's also called pairwise comparison or pairwise ranking. Choosing between two is easier than ordering a whole list or giving each item a score.

## What a voter sees

A voter opens the poll link, types their name and starts. They see two items side by side and pick one. Then they see the next pair, and so on, until their top list is settled. At the end they see that list.

For videos, the creator can turn on "each video plays once". Then both videos in a pair play to the end, with no replay, pause or seeking, before the voter can pick. With it off, and for images, voters can look as long as they like.

## How the pairs are chosen

<div class="article-picture" aria-hidden="true">
  <div class="knockout-picture">
    <svg class="knockout-lines" viewBox="0 0 600 240" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
      <path d="M95 30H190V60H285 M95 90H190V60 M95 150H190V180H285 M95 210H190V180 M345 60H440V120H520 M345 180H440V120" />
    </svg>
    <div class="knockout-round">
      <span class="knockout-card"><span class="frame"><img src="/demo/sunrise-hike.svg" alt="" loading="lazy"></span></span>
      <span class="knockout-card"><span class="frame"><img src="/demo/ramen-at-home.svg" alt="" loading="lazy"></span></span>
      <span class="knockout-card"><span class="frame"><img src="/demo/rocket-launch.svg" alt="" loading="lazy"></span></span>
      <span class="knockout-card"><span class="frame"><img src="/demo/city-at-night.svg" alt="" loading="lazy"></span></span>
    </div>
    <div class="knockout-round">
      <span class="knockout-card"><span class="frame"><img src="/demo/sunrise-hike.svg" alt="" loading="lazy"></span></span>
      <span class="knockout-card"><span class="frame"><img src="/demo/rocket-launch.svg" alt="" loading="lazy"></span></span>
    </div>
    <div class="knockout-round">
      <span class="knockout-card is-winner"><span class="frame"><img src="/demo/rocket-launch.svg" alt="" loading="lazy"></span></span>
    </div>
  </div>
</div>

Each voter gets their own knockout:

1. The items are shuffled, so each voter meets them in a different order.
2. They are paired up. The item you pick moves on to the next round.
3. If the number of items is odd, some items skip a round.
4. Rounds continue until the winner is clear. Then a few extra pairs settle the other places in the voter's top list, such as third place.

A knockout needs far fewer picks than comparing every pair. With 16 items, every possible pair would be 120 picks. A knockout finds the winner in 15.

## How the overall ranking works

The creator chooses a top size of 1, 3 or 5. Each finished voter's top list gives points: with a top 3, first place gets 3 points, second 2 and third 1. The overall ranking adds up everyone's points. If two items have the same points, the one with more first places ranks higher. If that is equal too, they share the place.

<div class="article-picture points-picture" aria-hidden="true">
  <ol class="voter-list">
    <li><span>A</span><b>3</b></li>
    <li><span>B</span><b>2</b></li>
    <li><span>C</span><b>1</b></li>
  </ol>
  <b class="points-plus">+</b>
  <ol class="voter-list">
    <li><span>B</span><b>3</b></li>
    <li><span>A</span><b>2</b></li>
    <li><span>C</span><b>1</b></li>
  </ol>
  <div class="points-total">
    <span>A: 3 + 2 = 5</span>
    <span>B: 2 + 3 = 5</span>
    <span>C: 1 + 1 = 2</span>
  </div>
</div>

Only voters who finished count. Someone who stops halfway doesn't change the ranking.

## What a knockout can't tell you

A knockout isn't a full ranking of every item for each voter. An item that meets a strong rival early leaves the voter's knockout early, even if it would have beaten the rest. Because the order is shuffled for every voter, this evens out as more people vote.

## When to use it

Voting in pairs works best when the items are alike and the question is a matter of taste: which thumbnail, which logo, which cut of a video. If you need a reason for each choice, or a score on a scale, use a survey instead.

## Related

- [How many voters do you need?](/guides/how-many-voters-do-you-need)
- [The paired comparison method](/guides/paired-comparison-method): comparing every pair by hand.
- [MaxDiff vs ranking questions vs pairwise comparison](/guides/maxdiff-vs-pairwise-comparison)
- [A pairwise ranking tool for images and videos](/for/pairwise-ranking): how many picks a voter makes, and when a tool that shows every pair fits better.
- [Thumbnails](/for/thumbnails), [logos](/for/logos) and [video cuts](/for/video-cuts): how a poll works for each.
