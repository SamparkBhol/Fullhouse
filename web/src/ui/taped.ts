import { h, uid } from "../dom.ts";

type Child = Node | string | null;

// A short note on white card, taped to the window frame with one strip.
export function tapedNote(heading: string, ...lines: Child[]): HTMLElement {
  const id = uid("note");
  return h(
    "aside",
    { class: "taped-note", "aria-labelledby": id },
    h("span", { class: "tape tape-mid", "aria-hidden": "true" }),
    h("h2", { id, class: "taped-note-title" }, heading),
    ...lines.map((l) => (typeof l === "string" ? h("p", null, l) : l)),
  );
}
