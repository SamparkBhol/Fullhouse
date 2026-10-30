import type { StreetRead } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { callsSentence, choiceCalls } from "./calls-words.ts";
import { openCalls } from "./sources.ts";

export function callsLine(read: StreetRead | null, tz?: string): HTMLElement | null {
  const sentence = callsSentence(choiceCalls(read?.provenance ?? []));
  if (!read || !sentence) return null;
  const button = h("button", { type: "button", class: "btn btn-quiet btn-small" }, "See every call");
  button.addEventListener("click", () => openCalls(read.provenance, null, { tz }));
  return h("section", { class: "panel calls-line", "aria-label": "The calls behind this choice" }, h("p", { class: "calls-sentence" }, sentence), button);
}
