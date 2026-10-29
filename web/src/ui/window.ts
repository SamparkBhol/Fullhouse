import { h, uid } from "../dom.ts";

type Child = Node | string | null | undefined | false | Child[];

export interface WindowOptions {
  size?: "big" | "small" | "wide";
  lettering?: string | Node;
  level?: "h2" | "h3";
  lit?: boolean;
  dark?: boolean;
  glass?: boolean;
  bare?: boolean;
  className?: string;
  label?: string;
}

// A shop window on the street: a frame with the window's name lettered on the transom, the room behind the glass
// lit by one pendant, and a wooden sill under it. A window with nothing to show is dark.
export function shopWindow(opts: WindowOptions, ...children: Child[]): HTMLElement {
  const size = opts.size ?? "small";
  const id = opts.lettering ? uid("win") : null;
  const classes = ["win", `win-${size}`];
  if (opts.dark) classes.push("win-dark");
  if (opts.glass) classes.push("win-glass");
  if (opts.bare) classes.push("win-bare");
  if (opts.className) classes.push(opts.className);
  const Level = opts.level ?? "h2";
  return h(
    "section",
    { class: classes.join(" "), "aria-labelledby": id, "aria-label": id ? null : (opts.label ?? null) },
    h(
      "div",
      { class: "win-frame" },
      opts.lettering ? h("div", { class: "win-transom" }, h(Level, { id, class: opts.lit ? "win-lettering lit-text" : "win-lettering" }, opts.lettering)) : null,
      h("div", { class: "win-room" }, opts.dark || opts.bare ? null : h("span", { class: "win-pendant", "aria-hidden": "true" }), h("div", { class: "win-inside" }, ...children)),
    ),
    h("div", { class: "win-sill", "aria-hidden": "true" }),
  );
}
