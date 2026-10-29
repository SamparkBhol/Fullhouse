import type { EditableCopy, NightPlan } from "../../../src/shared/contract.ts";
import { h, uid } from "../dom.ts";

const EDITS: Array<{ key: keyof EditableCopy; label: string; long?: boolean }> = [
  { key: "eventTitle", label: "Title" },
  { key: "eventDescription", label: "Description", long: true },
  { key: "posterHeadline", label: "Poster headline" },
  { key: "posterSub", label: "Poster line" },
];

// The owner approves the exact words that go out, and can change them here, before and after publishing.
export function wordsFieldset(plan: Pick<NightPlan, "copy">, inputs: Map<keyof EditableCopy, HTMLInputElement | HTMLTextAreaElement>, opts: { legend?: string; pitch?: boolean } = {}): HTMLElement {
  const fields = EDITS.map((e) => {
    const input = e.long ? h("textarea", { id: uid("copy"), rows: "5", maxlength: "1200" }) : h("input", { type: "text", id: uid("copy"), maxlength: "80" });
    input.value = plan.copy[e.key];
    inputs.set(e.key, input);
    return h("div", { class: "field-row" }, h("label", { for: input.id }, e.label), input);
  });
  return h(
    "fieldset",
    { class: "panel form" },
    h("legend", { class: "panel-legend" }, opts.legend ?? "The words that go out"),
    h("p", { class: "hint" }, "This is what guests read on the page and the poster. Change anything. Dashes and a few overused words are not allowed."),
    fields,
    opts.pitch === false ? null : h("details", { class: "disclose" }, h("summary", null, "The note to your partner"), h("p", { class: "copy-quote" }, h("strong", null, plan.copy.partnerPitch.subject)), h("p", { class: "copy-quote pre" }, plan.copy.partnerPitch.body)),
  );
}

export function editedCopy(plan: Pick<NightPlan, "copy">, inputs: Map<keyof EditableCopy, HTMLInputElement | HTMLTextAreaElement>): EditableCopy | undefined {
  const out: EditableCopy = {};
  for (const [key, input] of inputs) if (input.value.trim() !== plan.copy[key]) out[key] = input.value.trim();
  return Object.keys(out).length ? out : undefined;
}
