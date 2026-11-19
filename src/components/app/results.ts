// Creator results: overall ranking, voters, sharing, export, close and delete, with live refresh.
import {
  announce, api, confirmDialog, copyField, dateTime, fromNow, h, plural, thumb, type Poll, type Results,
} from "./client";

const REFRESH = 5000;

export function mountResults(root: HTMLElement) {
  let results: Results = JSON.parse(root.querySelector("[data-initial]")!.textContent!);
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const id = results.poll.id;
  const error = $("[data-error]");
  const showError = (message: string | null) => {
    error.textContent = message ?? "";
    error.hidden = !message;
  };

  const labels = () => new Map(results.items.map((item, index) => [item.id, item.label || `Item ${index + 1}`]));
  const itemById = () => new Map(results.items.map((item) => [item.id, item]));

  function renderHead() {
    const { poll } = results;
    $("[data-question]").textContent = poll.question;
    document.title = `${poll.question} | Pairpoll`;
    const full = poll.status === "open" && poll.admittedCount >= poll.voterCap;
    const badge = poll.status === "closed"
      ? h("span", { class: "badge badge--done" }, "Closed")
      : full
        ? h("span", { class: "badge badge--warn" }, "Full")
        : h("span", { class: "badge badge--live" }, "Open");
    const days = Math.max(1, Math.ceil((poll.expiresAt - Date.now()) / 86_400_000));
    $("[data-meta]").replaceChildren(
      badge,
      h("span", null, `${poll.admittedCount} of ${poll.voterCap} voters`),
      h("span", null, `${results.finished} finished`),
      h("span", { title: dateTime(poll.expiresAt) }, `Deleted in ${plural(days, "day")}`),
    );
  }

  function renderRanking() {
    const names = labels();
    const items = itemById();
    $("[data-ranking-note]").textContent = results.finished
      ? `From ${plural(results.finished, "finished voter")}`
      : "";
    if (!results.finished) {
      $("[data-ranking]").replaceChildren(
        h("p", { class: "empty-line" }, "No one has finished yet. The ranking appears here as soon as someone does."),
      );
      return;
    }
    // Where each row was, so rows can glide to their new places after a refresh.
    const before = new Map(
      [...root.querySelectorAll<HTMLElement>(".rank-item[data-id]")].map((row) => [row.dataset.id!, row.getBoundingClientRect().top]),
    );
    const best = Math.max(1, ...results.ranking.map((entry) => entry.points));
    $("[data-ranking]").replaceChildren(
      h(
        "ol",
        { class: "rank" },
        results.ranking.map((entry, index) =>
          h(
            "li",
            {
              class: `rank-item${entry.rank === 1 && entry.points ? " is-first" : index >= 3 ? " is-rest" : ""}${entry.points ? "" : " is-zero"}`,
              dataset: { id: entry.id },
            },
            h("span", { class: "rank-place" }, String(entry.rank)),
            h("span", { class: "frame rank-thumb" }, thumb(results.poll.kind, items.get(entry.id)!)),
            h(
              "span",
              { class: "rank-body" },
              h("span", { class: "rank-name" }, names.get(entry.id) ?? ""),
              h("span", { class: "rank-bar", "aria-hidden": "true" }, h("i", { style: `--share: ${(entry.points / best) * 100}%` })),
            ),
            h(
              "span",
              { class: "rank-meta" },
              h("span", { class: "rank-points" }, plural(entry.points, "point")),
              entry.firsts ? plural(entry.firsts, "first place") : null,
            ),
          ),
        ),
      ),
    );
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const row of root.querySelectorAll<HTMLElement>(".rank-item[data-id]")) {
      const top = before.get(row.dataset.id!);
      const moved = top === undefined ? 0 : top - row.getBoundingClientRect().top;
      if (moved) row.animate([{ transform: `translateY(${moved}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
  }

  function renderVoters() {
    const items = itemById();
    const { runs } = results;
    $("[data-voters-note]").textContent = runs.length ? `${runs.length} started, ${results.finished} finished` : "";
    if (!runs.length) {
      $("[data-voters]").replaceChildren(
        h("p", { class: "empty-line" }, results.poll.status === "open" ? "No one has started yet. Send the voting link to get votes." : "No one voted."),
      );
      return;
    }
    $("[data-voters]").replaceChildren(
      h(
        "ul",
        { class: "voter-list" },
        runs.map((run) =>
          h(
            "li",
            { class: "voter-row", dataset: { run: run.id } },
            h(
              "div",
              null,
              h("p", { class: "voter-name" }, run.name),
              h(
                "p",
                { class: "voter-time", title: dateTime(run.completedAt ?? run.createdAt) },
                run.ranking
                  ? h("span", { class: "badge badge--done" }, "Finished")
                  : h("span", { class: "badge" }, `Pick ${Math.min(run.index + 1, run.total)} of ${run.total}`),
                " ",
                run.ranking ? `${fromNow(run.completedAt!)}` : `Started ${fromNow(run.createdAt)}`,
              ),
            ),
            run.ranking
              ? h(
                  "ol",
                  { class: "voter-top", "aria-label": `${run.name}'s top list` },
                  run.ranking.map((itemId, place) =>
                    h(
                      "li",
                      { title: labels().get(itemId) },
                      h("span", null, String(place + 1)),
                      h("span", { class: "frame" }, thumb(results.poll.kind, items.get(itemId)!)),
                      h("span", { class: "visually-hidden" }, labels().get(itemId) ?? ""),
                    ),
                  ),
                )
              : h("span"),
            h(
              "button",
              {
                type: "button",
                class: "btn btn--quiet btn--sm",
                "aria-label": `Remove ${run.name}`,
                dataset: { focus: `remove-${run.id}` },
                onclick: () => removeVoter(run.id, run.name),
              },
              "Remove",
            ),
          ),
        ),
      ),
    );
  }

  function renderSide() {
    const { poll } = results;
    const link = `${location.origin}/p/${poll.code}`;
    $("[data-link-block]").replaceChildren(
      h("h2", null, "Voting link"),
      poll.status === "open"
        ? copyField(link, "Voting link")
        : h("p", null, "Voting is closed. People who open the link see that the poll is closed."),
    );

    const shared = poll.shareCode ? `${location.origin}/results/${poll.shareCode}` : null;
    const enabled = h("input", { type: "checkbox", id: "share-enabled", checked: Boolean(shared) });
    const names = h("input", { type: "checkbox", id: "share-names", checked: poll.shareNames });
    enabled.addEventListener("change", () => setSharing(enabled.checked, enabled.checked && poll.shareNames, "#share-enabled"));
    names.addEventListener("change", () => setSharing(true, names.checked, "#share-names"));
    $("[data-share-block]").replaceChildren(
      h(
        "label",
        { class: "switch" },
        h("span", null, h("span", { class: "check-label" }, "Results page"), h("span", { class: "check-hint" }, "A read-only page with the overall ranking that anyone with the link can see.")),
        enabled,
      ),
      ...(shared
        ? [
            copyField(shared, "Results page link"),
            h(
              "label",
              { class: "check" },
              names,
              h("span", null, h("span", { class: "check-label" }, "Show voter names"), h("span", { class: "check-hint" }, "Adds each finished voter's name and top list.")),
            ),
          ]
        : []),
    );

    $("[data-export]").replaceChildren(
      h("a", { class: "btn btn--secondary btn--sm", href: `/api/v1/polls/${id}/export?format=csv`, download: "pairpoll-results.csv" }, "Download CSV"),
      h("a", { class: "btn btn--secondary btn--sm", href: `/api/v1/polls/${id}/export?format=json`, download: "pairpoll-results.json" }, "Download JSON"),
    );
    $("[data-close]").hidden = poll.status !== "open";
  }

  // Re-rendering replaces elements; put focus back on the matching control.
  function render() {
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.focus;
    renderHead();
    renderRanking();
    renderVoters();
    if (focused) root.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus();
  }

  async function refresh() {
    try {
      const next = await api<Results>(`/polls/${id}/results`);
      if (JSON.stringify(next) === JSON.stringify(results)) return;
      const newlyFinished = next.finished - results.finished;
      const statusChanged = next.poll.status !== results.poll.status || next.poll.shareCode !== results.poll.shareCode
        || next.poll.shareNames !== results.poll.shareNames;
      results = next;
      render();
      if (statusChanged) renderSide();
      if (newlyFinished > 0) announce(`${plural(newlyFinished, "more voter")} finished.`);
      showError(null);
    } catch (problem) {
      showError((problem as Error).message);
    }
  }

  async function removeVoter(runId: string, name: string) {
    const ok = await confirmDialog({
      title: `Remove ${name}?`,
      body: `Their top list is removed from the results. Their place still counts toward the limit of ${results.poll.voterCap} voters.`,
      confirm: "Remove voter",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/polls/${id}/runs/${runId}`, "DELETE");
      announce(`${name} removed.`);
      await refresh();
      $<HTMLElement>("#voters-title").setAttribute("tabindex", "-1");
      $<HTMLElement>("#voters-title").focus();
    } catch (problem) {
      showError((problem as Error).message);
    }
  }

  async function setSharing(enabled: boolean, shareNames: boolean, focus: string) {
    try {
      const poll = await api<Poll>(`/polls/${id}/sharing`, "POST", { enabled, shareNames });
      results = { ...results, poll: { ...results.poll, shareCode: poll.shareCode, shareNames: poll.shareNames } };
      renderSide();
      root.querySelector<HTMLElement>(focus)?.focus();
      announce(enabled ? "Results page is on." : "Results page is off.");
    } catch (problem) {
      showError((problem as Error).message);
      renderSide();
    }
  }

  $("[data-close]").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Close this poll?",
      body: "No one can start or continue voting. Results stay here until the poll is deleted. Closing can't be undone.",
      confirm: "Close poll",
    });
    if (!ok) return;
    try {
      await api(`/polls/${id}/close`, "POST");
      await refresh();
      $<HTMLElement>("[data-question]").setAttribute("tabindex", "-1");
      $<HTMLElement>("[data-question]").focus();
      announce("The poll is closed.");
    } catch (problem) {
      showError((problem as Error).message);
    }
  });

  $("[data-delete]").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete this poll?",
      body: "The poll, its files and all votes are deleted. The voting link stops working right away.",
      confirm: "Delete poll",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/polls/${id}`, "DELETE");
      location.href = "/app";
    } catch (problem) {
      showError((problem as Error).message);
    }
  });

  render();
  renderSide();
  // Live refresh while the poll is open and the page is visible.
  window.setInterval(() => {
    if (results.poll.status === "open" && document.visibilityState === "visible") void refresh();
  }, REFRESH);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && results.poll.status === "open") void refresh();
  });
}
