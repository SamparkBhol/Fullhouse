import { explain } from "../errors.ts";
import { h } from "../dom.ts";

// A plan waits on the model, which can take half a minute, so a long wait shows it is still going.
function elapsed(): HTMLElement {
  const line = h("p", { class: "state-time", "aria-hidden": "true" });
  const started = Date.now();
  const timer = window.setInterval(() => {
    if (!line.isConnected) {
      window.clearInterval(timer);
      return;
    }
    const s = Math.round((Date.now() - started) / 1000);
    line.textContent = s >= 4 ? `${s} seconds so far.` : "";
  }, 1000);
  return line;
}

export function loading(heading: string, lines: string[] = []): HTMLElement {
  return h(
    "section",
    { class: "state state-loading", role: "status", "aria-live": "polite" },
    h("p", { class: "state-title" }, heading),
    lines.length ? h("ul", { class: "state-lines" }, lines.map((line) => h("li", null, line))) : null,
    elapsed(),
  );
}

export function failure(err: unknown, retry?: () => void): HTMLElement {
  const e = explain(err);
  return h(
    "section",
    { class: "state state-failure", role: "alert" },
    h("p", { class: "state-title" }, e.title),
    h("p", null, e.body),
    retry && e.retry ? h("button", { class: "btn btn-quiet", type: "button", onclick: () => retry() }, "Try again") : null,
  );
}

export function empty(text: string, ...extra: (Node | string)[]): HTMLElement {
  return h("div", { class: "empty" }, h("p", null, text), ...extra);
}
