// The voter's flow: intro with the rules, name and start; the pairs; the voter's own top list;
// and every state a poll link can be in. Used by /p/<code> and by the creator's preview.
import { ApiError, announce, h, mediaUrl, sticker, type PublicPoll, type VoterState } from "../app/client";
import { createCheck } from "../app/turnstile";
import { pairCount, type Driver } from "./driver";

type Item = PublicPoll["items"][number];
interface Tile {
  item: Item;
  card: HTMLElement;
  video?: HTMLVideoElement;
  pickButton?: HTMLButtonElement;
  sync?: () => void;
}
type StatusKey = "draft" | "closed" | "full" | "expired" | "removed" | "gone";

export interface VoterOptions {
  poll: PublicPoll;
  state: VoterState | null;
  removed: boolean;
  driver: Driver;
  /** Turnstile site key; absent in the preview, which skips the check. */
  sitekey?: string;
  /** Set in the creator's preview: where "Back to the draft" goes. */
  previewBack?: string;
}

const STATUS: Record<StatusKey, [string, string]> = {
  draft: ["This poll isn't open yet", "The person who made it hasn't started the vote. Try this link again later."],
  closed: ["This poll is closed", "Voting has ended, so no more picks can be made."],
  full: ["This poll is full", "It has reached its limit of voters, so no one else can start."],
  expired: ["This poll has ended", "Polls and their files are deleted 30 days after they're made."],
  removed: ["Your vote was removed", "The person who made this poll removed your vote. You can't vote again in this browser."],
  gone: ["This poll isn't available", "It may have been deleted. Ask the person who sent the link."],
};

const ERROR_STATUS: Record<string, StatusKey> = {
  poll_closed: "closed",
  poll_full: "full",
  poll_not_open: "draft",
  poll_expired: "expired",
  run_deleted: "removed",
  poll_not_found: "gone",
};

const PLAY_ICON = "M7 4.5v15l12.5-7.5z";
const CHECK_ICON = "M7.5 12.5l3 3 6-6.5";
const ZOOM_ICON = "M12.5 3.5h4v4M7.5 16.5h-4v-4M16.5 3.5l-5 5M3.5 16.5l5-5";

function svg(d: string, viewBox: string, attrs: Record<string, string>) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  element.setAttribute("viewBox", viewBox);
  element.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  for (const [key, value] of Object.entries(attrs)) path.setAttribute(key, value);
  element.appendChild(path);
  return element;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function mountVoter(root: HTMLElement, options: VoterOptions) {
  const { poll, driver } = options;
  const stage = root.querySelector<HTMLElement>("[data-stage]")!;
  const items = new Map(poll.items.map((item) => [item.id, item]));
  const ids = poll.items.map((item) => item.id);
  const isVideo = poll.kind === "video";
  const playsOnce = isVideo && poll.playsOnce;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Phones load only metadata until the voter taps play; desktops may buffer ahead.
  const preload = window.matchMedia("(pointer: fine)").matches ? "auto" : "metadata";
  const noun = isVideo ? "video" : "image";
  const ratios = new Map<string, Promise<number | null>>();
  let check: ReturnType<typeof createCheck> | null = null;
  let onVisible: (() => void) | null = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onVisible?.();
  });
  // Image pairs on a desktop: the arrow keys or 1 and 2 pick the left or right one.
  const keys = !isVideo && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let onKey: ((side: number) => void) | null = null;
  if (keys) {
    document.addEventListener("keydown", (event) => {
      const side = ({ ArrowLeft: 0, ArrowRight: 1, "1": 0, "2": 1 } as Record<string, number>)[event.key];
      // A held key would otherwise pick on every new pair.
      if (side === undefined || !onKey || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      onKey(side);
    });
  }

  const show = (...nodes: Node[]) => {
    onKey = null;
    stage.replaceChildren(...nodes);
  };

  // States -----------------------------------------------------------------------

  function status(key: StatusKey) {
    const [title, body] = STATUS[key];
    document.title = `${title} | Pairpoll`;
    show(
      h(
        "section",
        { class: "status" },
        statusArt(),
        h("h1", { tabindex: "-1" }, title),
        h("p", null, body),
      ),
    );
  }

  function statusArt() {
    const art = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    art.setAttribute("class", "status-art");
    art.setAttribute("viewBox", "0 0 88 40");
    art.setAttribute("fill", "none");
    art.setAttribute("stroke", "currentColor");
    art.setAttribute("stroke-width", "2");
    art.setAttribute("stroke-dasharray", "5 4");
    art.setAttribute("aria-hidden", "true");
    for (const x of [1, 49]) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      for (const [key, value] of Object.entries({ x: String(x), y: "5", width: "38", height: "30", rx: "4" })) rect.setAttribute(key, value);
      art.appendChild(rect);
    }
    return art;
  }

  function fail(error: unknown, inline: (message: string) => void) {
    if (error instanceof ApiError) {
      if (ERROR_STATUS[error.code]) return status(ERROR_STATUS[error.code]);
      if (error.code === "voter_cookie_required" || error.code === "run_not_found") return intro();
    }
    inline((error as Error).message);
  }

  function render(state: VoterState, entering = false) {
    if (state.ranking) return done(state.ranking, false);
    if (state.pair) return void pairScreen(state, entering);
  }

  // Intro ------------------------------------------------------------------------

  function intro() {
    document.title = `${poll.question} | Pairpoll`;
    const total = pairCount(ids, poll.topSize);
    const places = Math.min(poll.topSize, ids.length);
    const rules = [
      `You'll see ${total} pairs of ${noun}s, one pair at a time.`,
      ...(playsOnce
        ? ["Tap each video to play it. It plays once, with sound, and can't be paused or replayed.", "When both have played, pick the one you like more."]
        : isVideo
          ? ["Watch both as much as you like, then pick the one you like more."]
          : ["Tap the one you like more. To look closer, open it larger first."]),
      places === 1 ? "At the end you'll see your own pick." : `At the end you'll see your own top ${places}.`,
    ];

    const name = h("input", {
      class: "input",
      id: "voter-name",
      name: "name",
      autocomplete: "name",
      maxlength: "60",
      required: true,
      "aria-describedby": "voter-name-hint voter-name-error",
    });
    const error = h("p", { class: "field-error", id: "voter-name-error", "aria-live": "polite" });
    const start = h("button", { type: "submit", class: "btn btn--primary btn--lg btn--block" }, "All clear, start");
    const widget = h("div", { class: "turnstile" });
    const list = h("ol", { class: "rules" }, rules.map((rule) => h("li", null, rule)));
    const form = h(
      "form",
      { class: "intro-form", novalidate: true },
      h(
        "div",
        { class: "field" },
        h("label", { class: "field-label", for: "voter-name" }, "Your name"),
        h("p", { class: "field-hint", id: "voter-name-hint" }, options.previewBack ? "In the preview, any name works." : "The person who made this poll sees your name. They can choose to show it to others with the results."),
        name,
        error,
      ),
      widget,
      start,
    );
    show(h("section", { class: "intro" }, h("h1", null, poll.question), list, form));
    if (options.sitekey) check = createCheck(widget, options.sitekey, "join");

    name.addEventListener("input", () => {
      error.textContent = "";
      name.removeAttribute("aria-invalid");
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = name.value.replace(/\s+/g, " ").trim();
      const problem = (message: string) => {
        error.textContent = message;
        name.setAttribute("aria-invalid", "true");
        name.focus();
      };
      if (!value) return problem("Enter your name to start.");
      start.disabled = true;
      start.textContent = "Starting…";
      try {
        const state = await driver.join(value, () => (check ? check.token() : Promise.resolve("")));
        render(state, true);
      } catch (thrown) {
        start.disabled = false;
        start.textContent = "All clear, start";
        fail(thrown, problem);
      }
    });
  }

  // Pairs ------------------------------------------------------------------------

  function ratioOf(item: Item): Promise<number | null> {
    let known = ratios.get(item.id);
    if (!known) {
      known = !isVideo || item.posterId
        ? (() => {
            const image = new Image();
            image.src = mediaUrl(item.posterId ?? item.mediaId);
            return image.decode().then(() => image.naturalWidth / image.naturalHeight, () => null);
          })()
        : new Promise((resolve) => {
            const probe = document.createElement("video");
            probe.preload = "metadata";
            probe.muted = true;
            probe.onloadedmetadata = () => resolve(probe.videoWidth / probe.videoHeight || null);
            probe.onerror = () => resolve(null);
            probe.src = mediaUrl(item.mediaId);
          });
      ratios.set(item.id, known);
    }
    return Promise.race([known, wait(5000).then(() => null)]);
  }

  async function pairScreen(state: VoterState, entering: boolean) {
    const [a, b] = state.pair!.map((id) => items.get(id)!);
    const hadFocus = stage.contains(document.activeElement);
    const statusLine = h("p", { class: "duel-status", role: "status" });
    const pegs = Array.from({ length: state.total }, (_, i) => h("span", { class: `peg${i < state.index ? " is-done" : i === state.index ? " is-now" : ""}` }));
    const head = h(
      "header",
      { class: "vote-head" },
      h("p", { class: "vote-question" }, poll.question),
      h(
        "p",
        { class: "vote-count" },
        h("span", { class: "pegs", "aria-hidden": "true" }, pegs),
        `Pair ${state.index + 1} of ${state.total}`,
      ),
    );
    document.title = `${poll.question} | Pairpoll`;
    // Keep the old pair in place until the new one's shape is known, to avoid a jump.
    const measured = await Promise.all([ratioOf(a), ratioOf(b)]);
    const known = measured.filter((value): value is number => value !== null);
    const ratio = Math.min(2.4, Math.max(0.5, known.length ? Math.min(...known) : 16 / 9));

    let current = state;
    let busy = false;
    let playing: number | null = null;
    const tiles: Tile[] = [a, b].map((item, slot) => (isVideo ? videoTile(item, slot) : imageTile(item, slot)));
    const duel = h(
      "div",
      { class: `duel${ratio < 1.2 ? " duel--portrait" : ""}${entering ? " is-dealt" : ""}`, style: `--ratio-n: ${ratio}` },
      h("div", { class: "duel-pair" }, tiles[0].card, h("span", { class: "duel-or", "aria-hidden": "true" }, "or"), tiles[1].card),
    );
    tiles.forEach((tile) => tile.card.querySelector<HTMLElement>(".frame")!.style.setProperty("--ratio", String(ratio)));

    const say = (text: string, error = false) => {
      statusLine.replaceChildren(h("span", { class: "visually-hidden" }, `Pair ${current.index + 1} of ${current.total}. `), text);
      statusLine.classList.toggle("is-error", error);
    };

    show(h("section", { class: "vote" }, head, duel, statusLine));

    // Picking ----------------------------------------------------------------------
    async function pick(winner: string) {
      if (busy || (playsOnce && !current.played.every(Boolean))) return;
      busy = true;
      tiles.forEach((tile) => {
        tile.card.classList.add(tile.item.id === winner ? "is-picked" : "is-passed");
        tile.card.querySelectorAll("button").forEach((button) => (button.disabled = true));
      });
      pegs[current.index]?.classList.replace("is-now", "is-popped");
      say("Picked.");
      // Long enough to see the sticker land; the next pair is usable about 260 ms after the pick.
      const pause = wait(reduce.matches ? 120 : 260);
      try {
        const next = await driver.vote(current, winner);
        await pause;
        render(next, true);
      } catch (error) {
        busy = false;
        pegs[current.index]?.classList.replace("is-popped", "is-now");
        tiles.forEach((tile) => {
          tile.card.classList.remove("is-picked", "is-passed", "is-down");
          tile.card.querySelectorAll("button").forEach((button) => (button.disabled = false));
          tile.sync?.();
        });
        fail(error, (message) => say(`${message} Your pick wasn't saved; pick again.`, true));
      }
    }

    function imageTile(item: Item, slot: number): Tile {
      const label = slot ? "second" : "first";
      const src = mediaUrl(item.mediaId);
      const card = h(
        "div",
        { class: "duel-card", dataset: { item: item.id } },
        h(
          "button",
          { type: "button", class: "duel-hit", "aria-label": `Pick the ${label} image`, onclick: () => pick(item.id) },
          h("span", { class: "frame" }, h("img", { src, alt: "", draggable: "false" })),
        ),
        h(
          "button",
          { type: "button", class: "duel-zoom", "aria-label": `View the ${label} image larger`, title: "View larger", onclick: () => viewLarger(src, label, () => pick(item.id)) },
          svg(ZOOM_ICON, "0 0 20 20", { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" }),
        ),
        sticker(),
      );
      return { item, card };
    }

    // Video tiles ------------------------------------------------------------------
    function videoTile(item: Item, slot: number): Tile {
      const number = slot + 1;
      const poster = item.posterId ? mediaUrl(item.posterId) : undefined;
      const video = h("video", {
        playsinline: true,
        "webkit-playsinline": true,
        preload,
        poster,
        disablepictureinpicture: true,
        disableremoteplayback: true,
        controlslist: "nodownload noplaybackrate noremoteplayback",
        controls: !playsOnce,
        tabindex: playsOnce ? "-1" : undefined,
        "aria-label": `Video ${number}`,
        oncontextmenu: (event: Event) => event.preventDefault(),
      });
      video.src = mediaUrl(item.mediaId) + (!playsOnce && !poster ? "#t=0.1" : "");
      const frame = h("div", { class: "frame" }, video);
      const pickButton = h(
        "button",
        { type: "button", class: "btn btn--primary btn--block duel-pick", onclick: () => pick(item.id) },
        `Pick video ${number}`,
      );
      const card = h("div", { class: "duel-card", dataset: { item: item.id } }, h("div", { class: "duel-face" }, frame), sticker(), pickButton);
      const tile: Tile = { item, card, video, pickButton };
      if (!playsOnce) return tile;

      // Plays once: a cover starts playback on tap; no controls, so no pause, seek or replay.
      const cover = h(
        "button",
        { type: "button", class: "tile-cover", "aria-label": `Play video ${number}`, onclick: () => play() },
        h("span", { class: "tile-play" }, svg(PLAY_ICON, "0 0 24 24", { fill: "#fff" })),
        h("span", { class: "tile-cover-label" }, `Video ${number}`),
      );
      const note = h("div", { class: "tile-note", role: "status" });
      const seal = h(
        "div",
        { class: "tile-seal" },
        h(
          "span",
          null,
          svg(CHECK_ICON, "0 0 24 24", { fill: "none", stroke: "#fff", "stroke-width": "2.5", "stroke-linecap": "round", "stroke-linejoin": "round" }),
          "Played",
        ),
      );
      const disc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      for (const [key, value] of Object.entries({ cx: "12", cy: "12", r: "12", fill: "#15173a" })) disc.setAttribute(key, value);
      const sealArt = seal.querySelector("svg")!;
      sealArt.insertBefore(disc, sealArt.firstChild);
      // A bar along the bottom fills as the video plays, once.
      const bar = h("span", { class: "bar-play", "aria-hidden": "true" });
      video.addEventListener("timeupdate", () => bar.style.setProperty("--done", String(video.duration ? video.currentTime / video.duration : 0)));
      for (const part of [bar, cover, note, seal]) frame.appendChild(part);

      const setNote = (...content: (Node | string)[]) => {
        note.replaceChildren(...content);
        note.hidden = content.length === 0;
      };

      const sync = () => {
        const played = current.played[slot];
        const other = playing !== null && playing !== slot;
        cover.hidden = played || playing === slot;
        cover.disabled = other || busy;
        seal.hidden = !played;
        card.classList.toggle("is-waiting", other);
        card.classList.toggle("is-playing", playing === slot);
        const ready = current.played.every(Boolean);
        if (ready && pickButton.hidden) pickButton.classList.add("is-ready");
        pickButton.hidden = !ready;
        if (played || playing !== slot) setNote();
      };
      tile.sync = sync;

      async function play() {
        if (playing !== null || current.played[slot]) return;
        playing = slot;
        setNote();
        tiles.forEach((t) => t.sync?.());
        say(`Playing video ${number}.`);
        video.currentTime = 0;
        try {
          await video.play();
        } catch {
          // The browser blocked playback; the cover takes another tap.
          playing = null;
          tiles.forEach((t) => t.sync?.());
          say(`Tap video ${number} to play it.`);
        }
      }

      const resume = () => {
        video.play().then(() => setNote(), () => {});
      };

      video.addEventListener("waiting", () => {
        if (playing === slot) setNote(h("span", { class: "spinner", "aria-hidden": "true" }), "Loading…");
      });
      video.addEventListener("playing", () => {
        if (playing === slot) setNote();
      });
      video.addEventListener("pause", () => {
        if (playing !== slot || video.ended || document.visibilityState === "hidden") return;
        setNote(h("button", { type: "button", class: "btn btn--primary", onclick: resume }, "Keep watching"));
      });
      video.addEventListener("error", () => {
        if (current.played[slot]) return;
        if (playing === slot) playing = null;
        tiles.forEach((t) => t.sync?.());
        cover.hidden = true;
        setNote(
          "This video didn't load.",
          h("button", {
            type: "button",
            class: "btn btn--secondary",
            onclick: () => {
              setNote();
              video.load();
              tiles.forEach((t) => t.sync?.());
              cover.focus();
            },
          }, "Try again"),
        );
        say(`Video ${number} didn't load. Try again.`, true);
      });
      video.addEventListener("ended", () => void record());

      async function record() {
        try {
          const next = await driver.played(current, item.id);
          playing = null;
          if (next.index !== current.index || next.ranking) return render(next, true);
          current = next;
          tiles.forEach((t) => t.sync?.());
          if (current.played.every(Boolean)) {
            say("Both played. Pick the one you like more.");
            if (stage.contains(document.activeElement) || document.activeElement === document.body) tiles[0].pickButton?.focus();
          } else {
            const other = 1 - slot;
            say(`Now play video ${other + 1}.`);
            tiles[other].card.querySelector<HTMLElement>(".tile-cover")?.focus();
          }
        } catch (error) {
          fail(error, (message) =>
            setNote(message, h("button", { type: "button", class: "btn btn--secondary", onclick: () => void record() }, "Try again")),
          );
        }
      }

      sync();
      return tile;
    }

    // Coming back to the tab resumes the video that was playing; if the browser refuses, the tile asks for a tap.
    onVisible = () => {
      const video = playing === null ? undefined : tiles[playing].video;
      if (video?.paused && !video.ended && stage.contains(video)) video.play().catch(() => video.dispatchEvent(new Event("pause")));
    };

    if (playsOnce) {
      const remaining = current.played.findIndex((played) => !played);
      say(remaining === -1 ? "Both played. Pick the one you like more." : current.played.some(Boolean) ? `Now play video ${remaining + 1}.` : "Tap a video to play it. Each plays once.");
    } else if (keys) {
      statusLine.replaceChildren(
        h("span", { class: "visually-hidden" }, `Pair ${current.index + 1} of ${current.total}. `),
        "Click the one you like more, or press ",
        h("kbd", null, "←"),
        " ",
        h("kbd", null, "→"),
      );
      onKey = (side) => {
        if (busy) return;
        tiles[side].card.classList.add("is-down");
        void pick(tiles[side].item.id);
      };
    } else {
      say(isVideo ? "Watch both, then pick the one you like more." : "Tap the one you like more.");
    }
    if (entering && hadFocus) stage.querySelector<HTMLElement>(".duel-hit, .tile-cover:not([hidden]), .duel-pick:not([hidden]), video[controls]")?.focus();
    if (entering) announce(`Pair ${state.index + 1} of ${state.total}.`);
  }

  function viewLarger(src: string, label: string, onPick: () => void) {
    const dialog = h(
      "dialog",
      { class: "dialog viewer", "aria-label": `The ${label} image` },
      h("img", { src, alt: "" }),
      h(
        "div",
        { class: "actions" },
        h("button", { type: "button", class: "btn btn--primary", onclick: () => (dialog.close(), onPick()) }, "Pick this one"),
        h("button", { type: "button", class: "btn btn--quiet", onclick: () => dialog.close() }, "Close"),
      ),
    );
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  // End --------------------------------------------------------------------------

  function done(ranking: string[], already: boolean) {
    document.title = `Your top list | Pairpoll`;
    const title = ranking.length === 1 ? "Your pick" : `Your top ${ranking.length}`;
    const lead = options.previewBack
      ? "This was a preview. Nothing was saved."
      : already
        ? "You already voted in this poll. This is your top list."
        : "Your picks are saved. You can close this page.";
    const list = h(
      "ol",
      { class: `top-list${ranking.length > 1 ? " has-many" : ""}`, dataset: { count: String(ranking.length) } },
      ranking.map((id, place) => {
        const item = items.get(id)!;
        const media = !isVideo || item.posterId
          ? h("img", { src: mediaUrl(item.posterId ?? item.mediaId), alt: "" })
          : h("video", { src: `${mediaUrl(item.mediaId)}#t=0.1`, preload: "metadata", muted: true, playsinline: true, tabindex: "-1" });
        return h(
          "li",
          null,
          h("span", { class: "top-place" }, String(place + 1), h("span", { class: "visually-hidden" }, `: ${noun} ${place + 1} of your list`)),
          h("div", { class: "top-frame" }, h("span", { class: "frame", style: "--ratio: 16 / 9" }, media)),
        );
      }),
    );
    const heading = h("h1", { tabindex: "-1" }, title);
    show(
      h(
        "section",
        { class: "done" },
        h("div", null, h("p", { class: "done-question" }, poll.question), heading, h("p", { class: "done-lead" }, lead)),
        list,
        options.previewBack
          ? h(
              "div",
              { class: "actions" },
              h("button", { type: "button", class: "btn btn--primary", onclick: () => location.reload() }, "Start again"),
              h("a", { class: "btn btn--secondary", href: options.previewBack }, "Back to the draft"),
            )
          : null,
      ),
    );
    heading.focus();
  }

  // Start ------------------------------------------------------------------------

  if (options.removed) return status("removed");
  if (options.state?.ranking) return done(options.state.ranking, true);
  if (options.state?.pair && poll.status !== "closed") return render(options.state);
  if (poll.status === "open") return intro();
  status(poll.status === "draft" ? "draft" : poll.status);
}

/** "Report this poll": a short form that goes to the service owner, not the poll's creator. */
export function mountReport(button: HTMLButtonElement, code: string, send: (reason: string) => Promise<unknown>) {
  button.addEventListener("click", () => {
    const reason = h("textarea", { class: "input", id: "report-reason", maxlength: "500", required: true, rows: "4" });
    const error = h("p", { class: "field-error", "aria-live": "polite" });
    const submit = h("button", { type: "submit", class: "btn btn--primary" }, "Send report");
    const body = h(
      "form",
      { novalidate: true },
      h("h2", { id: "report-title" }, "Report this poll"),
      h("p", null, "Tell us what's wrong, for example spam, abuse or someone else's work. The person who made the poll doesn't see reports."),
      h("div", { class: "field" }, h("label", { class: "field-label", for: "report-reason" }, "What's wrong?"), reason, error),
      h("div", { class: "actions dialog-actions" }, submit, h("button", { type: "button", class: "btn btn--quiet", onclick: () => dialog.close() }, "Cancel")),
    );
    const dialog = h("dialog", { class: "dialog", "aria-labelledby": "report-title", dataset: { code } }, body);
    body.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = reason.value.trim();
      if (!text) {
        error.textContent = "Say briefly what's wrong.";
        reason.focus();
        return;
      }
      submit.disabled = true;
      try {
        await send(text);
        dialog.replaceChildren(
          h("div", { class: "stack-sm" },
            h("h2", { tabindex: "-1" }, "Thanks for reporting"),
            h("p", null, "We'll review this poll."),
            h("div", { class: "actions dialog-actions" }, h("button", { type: "button", class: "btn btn--primary", onclick: () => dialog.close() }, "Close"))),
        );
        dialog.querySelector("h2")!.focus();
      } catch (problem) {
        error.textContent = (problem as Error).message;
        submit.disabled = false;
      }
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      button.focus();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
