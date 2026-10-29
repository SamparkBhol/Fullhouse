import { h } from "../dom.ts";
import { shopWindow } from "./window.ts";

// Short notes taped to the inside of a dark window, one task on each, read from the street.
export function noteFrame(label: string, ...notes: HTMLElement[]): HTMLElement {
  return shopWindow({ size: "big", dark: true, className: "note-frame", label }, h("div", { class: "notes" }, notes));
}
