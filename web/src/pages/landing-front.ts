import { h } from "../dom.ts";

type Child = Node | null;

// One shop front on the street: a blank sign board, the window, its sill and the panel under it.
function front(className: string, lit: boolean, ...inside: Child[]): HTMLElement {
  return h(
    "div",
    { class: `front ${className}`, "aria-hidden": lit ? null : "true" },
    h("div", { class: "front-sign" }),
    h(
      "div",
      { class: lit ? "win win-big win-glass" : "win win-dark" },
      h("div", { class: "win-frame" }, h("div", { class: "win-room" }, lit ? h("span", { class: "win-pendant", "aria-hidden": "true" }) : null, h("div", { class: "win-inside" }, ...inside))),
      h("div", { class: "win-sill" }),
    ),
    h("div", { class: "front-riser" }),
  );
}

// Three shop fronts in a row. Only the middle one is lit, with the flyer taped inside; the other two are the quiet night.
export function shopFronts(flyer: HTMLElement): HTMLElement {
  return h("div", { class: "fronts" }, front("front-left", false), front("front-lit", true, flyer), front("front-right", false));
}
