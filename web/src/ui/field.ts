import { h, uid } from "../dom.ts";

export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  const id = input.id || uid("f");
  input.id = id;
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) input.setAttribute("aria-describedby", hintId);
  return h("div", { class: "field" }, h("label", { for: id }, label), hint ? h("p", { class: "hint", id: hintId }, hint) : null, input);
}
