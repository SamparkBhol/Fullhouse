import type { NightPlan } from "../../../src/shared/contract.ts";
import { h, uid } from "../dom.ts";
import { formatName } from "../format.ts";

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

// The plans for one date as small flyers taped above the window; the one in the window is pressed.
export function planOptions(plans: NightPlan[], onPick: (p: NightPlan) => void): HTMLElement | null {
  if (plans.length < 2) return null;
  const group = h("div", { class: "options", role: "group", "aria-label": "Choose between plans" });
  const pick = (button: HTMLButtonElement, p: NightPlan): void => {
    for (const b of group.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", "false");
      const state = b.querySelector(".option-state");
      if (state) state.textContent = "Tap to see it";
    }
    button.setAttribute("aria-pressed", "true");
    const state = button.querySelector(".option-state");
    if (state) state.textContent = "In the window";
    onPick(p);
  };
  plans.forEach((p, i) => {
    const button = h(
      "button",
      { type: "button", class: "option", "aria-pressed": i === 0 ? "true" : "false" },
      h("span", { class: "tape tape-mid", "aria-hidden": "true" }),
      h("span", { class: "option-kind" }, formatName(p.format, p.feature?.type)),
      p.feature ? h("span", { class: "option-name" }, p.feature.name) : null,
      h("span", { class: "option-state" }, i === 0 ? "In the window" : "Tap to see it"),
    );
    button.addEventListener("click", () => pick(button, p));
    group.append(button);
  });
  return group;
}
