import { h, uid } from "../dom.ts";

type Child = Node | string | null | undefined | false | Child[];

// Below the one lit window, things rest on the street side: postcards, the chalkboard, sleeves on the ledge.
// A label names a group only where the objects do not name themselves.
export function ledge(opts: { label?: string; level?: "h2" | "h3"; className?: string }, ...children: Child[]): HTMLElement {
  const id = opts.label ? uid("ledge") : null;
  const Level = opts.level ?? "h2";
  return h(
    "section",
    { class: ["ledge", opts.className].filter(Boolean).join(" "), "aria-labelledby": id },
    opts.label ? h(Level, { id, class: "ledge-label" }, opts.label) : null,
    ...children,
  );
}

// Groups side by side on a wide screen and one under another on a phone, so no list is cut at the screen edge.
export function ledgeRow(label: string, ...groups: (HTMLElement | null)[]): HTMLElement {
  return h("div", { class: "ledge-row", role: "region", "aria-label": label }, groups.filter(Boolean));
}
