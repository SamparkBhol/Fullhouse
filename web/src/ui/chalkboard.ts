import { h, uid } from "../dom.ts";
import type { BoardLine } from "./lines.ts";

// A chalkboard in a wooden frame, the way a counter writes up its menu.
export function chalkboard(opts: { title: string; level?: "h2" | "h3"; intro?: string; lines: BoardLine[]; empty?: string; className?: string }): HTMLElement {
  const id = uid("slate");
  const Level = opts.level ?? "h3";
  return h(
    "section",
    { class: ["slate", opts.className].filter(Boolean).join(" "), "aria-labelledby": id },
    h(Level, { id, class: "slate-title" }, opts.title),
    opts.intro && opts.lines.length ? h("p", { class: "slate-intro" }, opts.intro) : null,
    opts.lines.length
      ? h(
          "ul",
          { class: "slate-lines" },
          opts.lines.map((l) =>
            h(
              "li",
              null,
              h("span", { class: "slate-text" }, l.text),
              l.count ? h("span", { class: "slate-count" }, l.count) : null,
              l.note ? h("span", { class: "slate-note" }, l.note) : null,
            ),
          ),
        )
      : h("p", { class: "slate-empty" }, opts.empty ?? ""),
  );
}
