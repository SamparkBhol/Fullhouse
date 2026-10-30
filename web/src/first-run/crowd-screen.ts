import { h } from "../dom.ts";

export function limitsLine(name: string): HTMLElement {
  return h("p", { class: "limits-line" }, `A pattern across many people who like ${name}, not a fact about any one of them.`);
}

export function screenHead(heading: string, lead: string | null, ...rest: (HTMLElement | null)[]): HTMLElement {
  return h("div", { class: "screen-head" }, h("h1", { tabindex: "-1" }, heading), lead ? h("p", null, lead) : null, ...rest);
}
