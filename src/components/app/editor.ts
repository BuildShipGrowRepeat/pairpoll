// Draft editor: settings with autosave, uploads one file per request with progress and retry,
// poster frames for videos, reorder and remove, preview, and opening the poll.
import {
  announce, api, ApiError, confirmDialog, copyField, fileSize, h, loop, plural, sheetStrip, thumb, upload, type Item, type Poll,
} from "./client";

type Kind = "image" | "video";

const KINDS = {
  image: { mimes: ["image/jpeg", "image/png", "image/webp", "image/gif"], max: 10_000_000, types: "JPEG, PNG, WebP or GIF", noun: "image" },
  video: { mimes: ["video/mp4", "video/webm"], max: 30_000_000, types: "MP4 or WebM", noun: "video" },
} as const;
const MAX_ITEMS = 16;

interface Row {
  key: string;
  name: string;
  status: "queued" | "uploading" | "ready" | "error";
  item?: Item;
  file?: File;
  poster?: Promise<Blob | null>;
  preview?: string;
  progress: number;
  error?: string;
  canRetry?: boolean;
  busy?: boolean;
  abort?: () => void;
}

const ICONS = {
  up: "m5 12.5 5-5 5 5",
  down: "m5 7.5 5 5 5-5",
  remove: "M5.5 5.5l9 9m0-9-9 9",
  retry: "M15.5 9.5a5.5 5.5 0 1 1-1.8-4.1M15.5 3.5v3.6h-3.6",
};

function icon(name: keyof typeof ICONS) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name]);
  svg.appendChild(path);
  return svg;
}

/** Grabs one frame about a quarter in (at most 1 s) as a JPEG, or null if the browser can't decode it. */
export function capturePoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };
    const timer = window.setTimeout(() => done(null), 8000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 4;
      video.currentTime = Math.min(1, duration / 4);
    };
    video.onseeked = () => {
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      if (!canvas.width || !canvas.height) return done(null);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => done(blob), "image/jpeg", 0.85);
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

export function mountEditor(root: HTMLElement) {
  let poll: Poll | null = JSON.parse(root.querySelector("[data-initial]")!.textContent!);
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const question = $<HTMLInputElement>("#question");
  const questionError = $("#question-error");
  const cap = $<HTMLInputElement>("#voter-cap");
  const capError = $("#voter-cap-error");
  const playsOnce = $<HTMLInputElement>("#plays-once");
  const kindInputs = [...root.querySelectorAll<HTMLInputElement>("input[name=kind]")];
  const topInputs = [...root.querySelectorAll<HTMLInputElement>("input[name=top]")];
  const saveState = $("[data-save-state]");
  const list = $<HTMLOListElement>("[data-items]");
  const dropzone = $("[data-dropzone]");
  const fileInput = $<HTMLInputElement>("[data-file-input]");
  const pick = $<HTMLButtonElement>("[data-pick]");
  const openButton = $<HTMLButtonElement>("[data-open]");
  const preview = $<HTMLAnchorElement>("[data-preview]");
  const openHint = $("[data-open-hint]");
  const editorError = $("[data-editor-error]");

  let kind: Kind = poll?.kind ?? (kindInputs.find((input) => input.checked)?.value as Kind) ?? "image";
  const rows: Row[] = (poll?.items ?? []).map((item) => ({
    key: item.id, name: item.label || "Untitled", status: "ready", item, progress: 1,
  }));
  let focusAfter: { key: string; action: string } | null = null;

  // Settings ------------------------------------------------------------------

  const setSave = (text: string, error = false) => {
    saveState.textContent = text;
    saveState.dataset.tone = error ? "error" : "";
  };
  const showError = (message: string | null) => {
    editorError.textContent = message ?? "";
    editorError.hidden = !message;
  };

  const questionValue = () => question.value.replace(/\s+/g, " ").trim();
  const capValue = () => {
    const value = Number(cap.value);
    return Number.isInteger(value) && value >= 1 && value <= 200 ? value : null;
  };
  const topValue = () => Number(topInputs.find((input) => input.checked)?.value ?? 3) as 1 | 3 | 5;

  function fieldError(input: HTMLInputElement, target: HTMLElement, message: string) {
    target.textContent = message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  let saving: Promise<unknown> = Promise.resolve();
  function save(changes: Record<string, unknown>) {
    if (!poll) return;
    setSave("Saving…");
    saving = saving.then(async () => {
      try {
        poll = await api<Poll>(`/polls/${poll!.id}`, "PATCH", changes);
        setSave("Saved");
      } catch (problem) {
        setSave(`Not saved. ${(problem as Error).message}`, true);
      }
    });
  }

  let questionTimer = 0;
  function saveQuestion() {
    window.clearTimeout(questionTimer);
    const value = questionValue();
    if (!value) {
      fieldError(question, questionError, "Enter a question. Voters see it above every pair.");
      return;
    }
    if (poll && value !== poll.question) save({ question: value });
  }
  question.addEventListener("input", () => {
    fieldError(question, questionError, "");
    window.clearTimeout(questionTimer);
    if (poll) questionTimer = window.setTimeout(saveQuestion, 700);
    else update();
  });
  question.addEventListener("change", saveQuestion);

  topInputs.forEach((input) => input.addEventListener("change", () => save({ topSize: topValue() })));
  playsOnce.addEventListener("change", () => save({ playsOnce: playsOnce.checked }));
  cap.addEventListener("input", () => fieldError(cap, capError, ""));
  cap.addEventListener("change", () => {
    const value = capValue();
    if (value === null) return fieldError(cap, capError, "Enter a whole number from 1 to 200.");
    if (poll && value !== poll.voterCap) save({ voterCap: value });
  });

  kindInputs.forEach((input) =>
    input.addEventListener("change", () => {
      setKind(input.value as Kind);
      update();
    }),
  );

  function setKind(next: Kind) {
    kind = next;
    kindInputs.forEach((input) => (input.checked = input.value === next));
    $("[data-plays-once-row]").hidden = next !== "video";
    $("[data-items-title]").textContent = next === "video" ? "Videos" : "Images";
    fileInput.accept = KINDS[next].mimes.join(",");
  }

  // Draft creation ------------------------------------------------------------

  let creating: Promise<Poll> | null = null;
  function ensurePoll(): Promise<Poll> {
    if (poll) return Promise.resolve(poll);
    creating ??= api<Poll>("/polls", "POST", {
      kind,
      question: questionValue(),
      topSize: topValue(),
      playsOnce: kind === "video" && playsOnce.checked,
      voterCap: capValue() ?? 50,
    })
      .then((created) => {
        poll = created;
        cap.value = String(created.voterCap);
        history.replaceState(null, "", `/app/polls/${created.id}`);
        document.title = "Edit draft | Pairpoll";
        $("[data-title]").textContent = "Edit draft";
        $("[data-kind-hint]").hidden = false;
        $("[data-delete]").hidden = false;
        setSave("Saved");
        return created;
      })
      .finally(() => (creating = null));
    return creating;
  }

  // Files ---------------------------------------------------------------------

  const counted = () => rows.filter((row) => row.status !== "error");
  const ready = () => rows.filter((row) => row.status === "ready");
  const pending = () => rows.some((row) => row.status === "queued" || row.status === "uploading");

  function check(file: File): string | undefined {
    const rules = KINDS[kind];
    const other = kind === "image" ? "video" : "image";
    if (!rules.mimes.includes(file.type as never)) {
      if ((KINDS[other].mimes as readonly string[]).includes(file.type)) {
        return `This is ${other === "image" ? "an image" : "a video"}. This poll compares ${kind}s.`;
      }
      return `This file type isn't supported. Use ${rules.types}.`;
    }
    if (file.size > rules.max) return `This file is ${fileSize(file.size)}. ${rules.noun[0].toUpperCase()}${rules.noun.slice(1)}s can be up to ${rules.max / 1_000_000} MB.`;
    if (file.size === 0) return "This file is empty.";
  }

  function addFiles(files: File[]) {
    if (!files.length || !canAdd()) return;
    showError(null);
    // Before the draft exists, the first files decide the kind when they are all the same.
    if (!poll && !rows.length) {
      if (files.every((file) => file.type.startsWith("video/"))) setKind("video");
      else if (files.every((file) => file.type.startsWith("image/"))) setKind("image");
    }
    for (const file of files) {
      let error = check(file);
      if (!error && counted().length >= MAX_ITEMS) error = `A poll holds up to ${MAX_ITEMS} ${kind}s.`;
      const row: Row = { key: crypto.randomUUID(), name: file.name, file, status: error ? "error" : "queued", progress: 0, error };
      if (!error) {
        if (kind === "image") row.preview = URL.createObjectURL(file);
        else {
          row.poster = capturePoster(file);
          void row.poster.then((blob) => {
            if (blob && rows.includes(row)) {
              row.preview = URL.createObjectURL(blob);
              render();
            }
          });
        }
      }
      rows.push(row);
    }
    announce(`${plural(files.length, "file")} added.`);
    update();
    void pump();
  }

  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      for (let row = rows.find((r) => r.status === "queued"); row; row = rows.find((r) => r.status === "queued")) {
        await send(row);
      }
    } finally {
      pumping = false;
      update();
    }
  }

  async function send(row: Row) {
    row.status = "uploading";
    row.progress = 0;
    row.error = undefined;
    update();
    try {
      const target = await ensurePoll();
      if (!row.item) {
        const task = upload<Item>(`/polls/${target.id}/items`, row.file!, row.name, (share) => progress(row, share));
        row.abort = task.abort;
        row.item = await task.done;
        row.abort = undefined;
      }
      const poster = await row.poster;
      if (poster && !row.item.posterId && rows.includes(row)) {
        // The poster is optional: without it, voters see the video's own first frame.
        row.item = await upload<Item>(`/polls/${target.id}/items/${row.item.id}/poster`, poster, null, () => {}).done.catch(() => row.item!);
      }
      if (!rows.includes(row)) return;
      row.status = "ready";
      row.file = undefined;
      announce(`${row.name} uploaded.`);
    } catch (problem) {
      if (!rows.includes(row)) return;
      const error = problem as ApiError;
      row.status = "error";
      row.error = error.message;
      row.canRetry = !(error instanceof ApiError) || ![400, 409, 411, 413, 415].includes(error.status) || error.code === "poll_changed";
      if (error.code === "poll_limit") showError(error.message);
      announce(`${row.name} failed to upload.`);
    }
    update();
  }

  function progress(row: Row, share: number) {
    row.progress = share;
    const element = list.querySelector<HTMLElement>(`[data-key="${row.key}"]`);
    element?.querySelector<HTMLElement>(".progress")?.style.setProperty("--done", String(share));
    const meta = element?.querySelector(".item-meta");
    if (meta) meta.textContent = share < 1 ? `Uploading ${Math.round(share * 100)}%` : "Saving…";
  }

  async function remove(row: Row) {
    row.abort?.();
    if (row.item && poll) {
      row.busy = true;
      render();
      try {
        await api(`/polls/${poll.id}/items/${row.item.id}`, "DELETE");
      } catch (problem) {
        row.busy = false;
        showError((problem as Error).message);
        render();
        return;
      }
    }
    const index = rows.indexOf(row);
    rows.splice(index, 1);
    if (row.preview) URL.revokeObjectURL(row.preview);
    announce(`${row.name} removed.`);
    const next = rows[index] ?? rows[index - 1];
    focusAfter = next ? { key: next.key, action: "remove" } : null;
    update();
    if (!next) pick.focus();
  }

  async function move(row: Row, delta: -1 | 1) {
    const order = ready();
    const from = order.indexOf(row);
    const to = from + delta;
    if (!poll || to < 0 || to >= order.length) return;
    const a = rows.indexOf(order[from]);
    const b = rows.indexOf(order[to]);
    [rows[a], rows[b]] = [rows[b], rows[a]];
    focusAfter = { key: row.key, action: delta < 0 ? "up" : "down" };
    render();
    announce(`${row.name} moved to position ${to + 1}.`);
    setSave("Saving…");
    try {
      await api(`/polls/${poll.id}/items/reorder`, "POST", { ids: ready().map((r) => r.item!.id) });
      setSave("Saved");
    } catch (problem) {
      [rows[a], rows[b]] = [rows[b], rows[a]];
      setSave(`Not saved. ${(problem as Error).message}`, true);
      render();
    }
  }

  // Rendering -----------------------------------------------------------------

  function rowThumb(row: Row) {
    if (row.preview) return h("img", { src: row.preview, alt: "" });
    if (row.item) return thumb(kind, row.item);
    return null;
  }

  function rowMeta(row: Row) {
    if (row.busy) return "Removing…";
    if (row.status === "queued") return "Waiting to upload";
    if (row.status === "uploading") return row.progress < 1 ? `Uploading ${Math.round(row.progress * 100)}%` : "Saving…";
    if (row.status === "error") return row.error ?? "The upload failed.";
    return fileSize(row.item!.bytes);
  }

  function render() {
    const order = ready();
    const locked = pending();
    let position = 0;
    list.replaceChildren(
      ...rows.map((row) => {
        const isReady = row.status === "ready";
        const index = order.indexOf(row);
        const button = (action: string, label: string, name: keyof typeof ICONS, onclick: () => void, disabled = false) =>
          h("button", { type: "button", class: "icon-btn", "aria-label": `${label}: ${row.name}`, title: label, dataset: { action }, disabled: disabled || row.busy, onclick }, icon(name));
        return h(
          "li",
          { class: `item-row${row.status === "error" ? " is-error" : ""}`, dataset: { key: row.key } },
          h("span", { class: "item-pos", "aria-hidden": "true" }, row.status === "error" ? "" : String(++position)),
          h("span", { class: "frame" }, rowThumb(row)),
          h(
            "div",
            null,
            h("p", { class: "item-name" }, row.name),
            h("p", { class: "item-meta" }, rowMeta(row)),
            row.status === "uploading" && h("div", { class: "progress", style: `--done: ${row.progress}` }, h("span")),
          ),
          h(
            "div",
            { class: "item-actions" },
            isReady && button("up", "Move up", "up", () => move(row, -1), locked || index === 0),
            isReady && button("down", "Move down", "down", () => move(row, 1), locked || index === order.length - 1),
            row.status === "error" && row.canRetry && button("retry", "Retry", "retry", () => {
              row.status = "queued";
              focusAfter = { key: row.key, action: "remove" };
              update();
              void pump();
            }),
            button("remove", isReady || row.status === "error" ? "Remove" : "Cancel upload", "remove", () => remove(row)),
          ),
        );
      }),
    );
    if (focusAfter) {
      // Keep focus on the same control after a re-render; fall back to a neighbouring one.
      const { key, action } = focusAfter;
      const candidates = [action, action === "up" ? "down" : "up", "remove"].map((name) =>
        list.querySelector<HTMLButtonElement>(`[data-key="${key}"] [data-action="${name}"]`));
      candidates.find((button) => button && !button.disabled)?.focus();
      focusAfter = null;
    }
  }

  function canAdd() {
    return Boolean(poll || questionValue());
  }

  function update() {
    render();
    const rules = KINDS[kind];
    const total = counted().length;
    const readyCount = ready().length;
    const enabled = canAdd() && total < MAX_ITEMS;
    kindInputs.forEach((input) => (input.disabled = Boolean(poll) || rows.length > 0));
    dropzone.setAttribute("aria-disabled", String(!enabled));
    // Once files are in, the drop area shrinks to one line below the list.
    dropzone.classList.toggle("is-compact", rows.length > 0);
    pick.disabled = !enabled;
    $("[data-drop-label]").textContent = !canAdd()
      ? "Enter the question first"
      : total >= MAX_ITEMS
        ? `This poll has the maximum of ${MAX_ITEMS} ${rules.noun}s`
        : `Drop ${rules.noun}s here`;
    $("[data-drop-hint]").textContent = `${rules.types}, up to ${rules.max / 1_000_000} MB each. 2 to ${MAX_ITEMS} ${rules.noun}s.`;
    $("[data-items-count]").textContent = total ? `${total} of ${MAX_ITEMS}` : "";

    let hint = "";
    if (pending()) hint = "Wait for the uploads to finish.";
    else if (readyCount < 2) hint = `Add at least ${2 - readyCount} more ${readyCount === 1 ? rules.noun : `${rules.noun}s`} to open the poll.`;
    openHint.textContent = hint;
    const openable = Boolean(poll) && !hint;
    openButton.disabled = !openable;
    preview.setAttribute("aria-disabled", String(!openable));
    if (openable) preview.href = `/app/polls/${poll!.id}/preview`;
    else preview.removeAttribute("href");
  }

  pick.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    addFiles([...(fileInput.files ?? [])]);
    fileInput.value = "";
  });

  // Files can be dropped anywhere on the page; the drop zone shows that it will take them.
  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    dragDepth++;
    dropzone.classList.toggle("is-over", canAdd());
  });
  window.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      dropzone.classList.remove("is-over");
    }
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove("is-over");
    if (!root.querySelector<HTMLElement>("[data-editing]")!.hidden) addFiles([...(event.dataTransfer?.files ?? [])]);
  });

  window.addEventListener("beforeunload", (event) => {
    if (pending()) event.preventDefault();
  });

  // Actions -------------------------------------------------------------------

  openButton.addEventListener("click", async () => {
    if (!poll) return;
    const target = poll;
    if (!questionValue()) return saveQuestion();
    const ok = await confirmDialog({
      title: "Open this poll?",
      body: "People can vote as soon as you share the link. Items and settings can't change after this.",
      confirm: "Open poll",
    });
    if (!ok) return;
    openButton.disabled = true;
    openButton.textContent = "Opening…";
    saveQuestion();
    await saving;
    try {
      showOpened(await api<Poll>(`/polls/${target.id}/open`, "POST"));
    } catch (problem) {
      showError((problem as Error).message);
      openButton.textContent = "Open poll";
      update();
    }
  });

  preview.addEventListener("click", (event) => {
    if (preview.getAttribute("aria-disabled") === "true") event.preventDefault();
  });

  $("[data-delete]").addEventListener("click", async () => {
    if (!poll) return;
    const ok = await confirmDialog({
      title: "Delete this draft?",
      body: "The draft and its files will be deleted.",
      confirm: "Delete draft",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/polls/${poll.id}`, "DELETE");
      location.href = "/app";
    } catch (problem) {
      showError((problem as Error).message);
    }
  });

  function showOpened(opened: Poll) {
    const link = `${location.origin}/p/${opened.code}`;
    const share = "share" in navigator
      ? h("button", {
          type: "button",
          class: "btn btn--secondary",
          onclick: () => navigator.share({ title: opened.question, url: link }).catch(() => {}),
        }, "Share…")
      : null;
    const panel = $("[data-opened]");
    panel.replaceChildren(
      h(
        "div",
        { class: "opened" },
        h("div", { class: "opened-mark" }, sheetStrip(opened.kind, opened.items), loop("opened-loop")),
        h("h1", { tabindex: "-1" }, "Your poll is open"),
        h("p", null, "Send this link to the people you want to ask. They don't need an account."),
        copyField(link, "Voting link"),
        h("div", { class: "actions" }, share, h("a", { class: "btn btn--secondary", href: `/app/polls/${opened.id}` }, "See results")),
      ),
    );
    $("[data-editing]").hidden = true;
    panel.hidden = false;
    document.title = "Poll open | Pairpoll";
    panel.querySelector("h1")!.focus();
  }

  setKind(kind);
  update();
}
