import { explain } from "../api.ts";
import { h } from "../dom.ts";

export function loading(heading: string, lines: string[] = []): HTMLElement {
  return h(
    "section",
    { class: "state state-loading", role: "status", "aria-live": "polite" },
    h("span", { class: "lamp", "aria-hidden": "true" }, h("span"), h("span"), h("span")),
    h("p", { class: "state-title" }, heading),
    lines.length ? h("ul", { class: "state-lines" }, lines.map((line) => h("li", null, line))) : null,
  );
}

export function failure(err: unknown, retry?: () => void): HTMLElement {
  const e = explain(err);
  return h(
    "section",
    { class: "state state-failure", role: "alert" },
    h("p", { class: "state-title" }, e.title),
    h("p", null, e.body),
    retry && e.retry ? h("button", { class: "button", type: "button", onclick: () => retry() }, "Try again") : null,
  );
}

export function empty(text: string, ...extra: (Node | string)[]): HTMLElement {
  return h("div", { class: "empty" }, h("p", null, text), ...extra);
}

export function limitsLine(limits: string[] | undefined): HTMLElement | null {
  const items = (limits ?? []).filter((l) => l && l.trim());
  if (!items.length) return null;
  return h(
    "aside",
    { class: "limits", "aria-label": "Limits of this read" },
    h("p", { class: "limits-head" }, "What this does not tell you"),
    h("ul", null, items.map((l) => h("li", null, l))),
  );
}
