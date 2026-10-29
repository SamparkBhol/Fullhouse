import { h } from "../dom.ts";
import { swatch, type Mark } from "./hover.ts";

type Child = Node | string | null | undefined | false;

export interface PaneSpec {
  key: string;
  title: string;
  line: string;
  span: "stat" | "wide" | "side";
  body: Child[];
}

export function pane(spec: PaneSpec): HTMLElement {
  const id = `pane-${spec.key}`;
  return h(
    "section",
    { class: `panel pane pane-${spec.span}`, "aria-labelledby": id, "data-pane": spec.key },
    h("h2", { class: "pane-title", id }, spec.title),
    h("p", { class: "pane-line" }, spec.line),
    ...spec.body,
  );
}

export function legend(items: { label: string; mark: Mark; value?: string }[]): HTMLElement {
  return h(
    "ul",
    { class: "legend" },
    items.map((i) => h("li", null, swatch(i.mark), h("span", null, i.label), i.value !== undefined ? h("strong", { class: "num" }, i.value) : null)),
  );
}

// Open tables stay open when a poll redraws the board.
export function openTables(root: ParentNode): Set<string> {
  return new Set([...root.querySelectorAll<HTMLDetailsElement>("details.as-table[open]")].map((d) => d.dataset.key ?? ""));
}

export function reopenTables(root: ParentNode, keys: Set<string>): void {
  for (const d of root.querySelectorAll<HTMLDetailsElement>("details.as-table")) if (keys.has(d.dataset.key ?? "")) d.open = true;
}
