import type { Night } from "../../../src/shared/contract.ts";
import { plural } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { longDate, todayIn } from "../format.ts";
import { failure } from "./states.ts";
import { mondayLine } from "./turnout.ts";
import { ledge } from "./ledge.ts";
import { refreshState, type VenueCtx } from "../venue-context.ts";

export function turnoutWindow(ctx: VenueCtx, night: Night, redraw: (n: Night, notice: string) => void): HTMLElement {
  const venue = ctx.state.venue;
  if (night.date > todayIn(venue.tz)) {
    return ledge({ label: "Turnout" }, h("p", { class: "ledge-empty" }, `After the night, come back here and log how many people came. It opens on ${longDate(night.date)}.`));
  }
  const done: HTMLElement[] = [];
  if (night.headcount !== undefined) {
    done.push(h("p", { class: "big-line" }, `${plural(night.headcount, "person", "people")} came.`));
    const next = mondayLine(night, venue);
    if (next) done.push(h("p", { class: "monday-line" }, next));
    if (night.resultNote) done.push(h("p", { class: "quote" }, night.resultNote));
  }
  const needsCap = night.maxPeople === undefined && !venue.capacity;
  const cap = h("input", { type: "number", id: uid("cap"), min: "1", max: "5000", inputmode: "numeric" });
  const head = h("input", { type: "number", id: uid("hc"), min: "0", max: "5000", inputmode: "numeric", required: true, value: night.headcount !== undefined ? String(night.headcount) : null });
  const note = h("textarea", { id: uid("note"), rows: "2", maxlength: "500" });
  if (night.resultNote) note.value = night.resultNote;
  const slot = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form", novalidate: true },
    h("div", { class: "field" }, h("label", { for: head.id }, "How many people came"), head),
    needsCap ? h("div", { class: "field" }, h("label", { for: cap.id }, "How many fit in the room"), h("p", { class: "hint" }, "Optional. Monday measures the turnout against it."), cap) : null,
    h("div", { class: "field" }, h("label", { for: note.id }, "Anything to remember"), h("p", { class: "hint", id: `${note.id}-hint` }, "Optional. Stays with your venue and is never sent to Qloo."), note),
    h("p", { class: "actions" }, h("button", { class: "button", type: "submit" }, night.headcount !== undefined ? "Update the turnout" : "Save the turnout")),
    slot,
  );
  note.setAttribute("aria-describedby", `${note.id}-hint`);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const n = Number(head.value);
    if (head.value === "" || !Number.isInteger(n) || n < 0) {
      replace(slot, h("p", { class: "form-error", role: "alert" }, "Type the number of people as a whole number."));
      head.focus();
      return;
    }
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    try {
      const room = needsCap && cap.value ? Number(cap.value) : undefined;
      const saved = await api.result(ctx.id, ctx.token, night.id, {
        headcount: n,
        ...(note.value.trim() ? { note: note.value.trim() } : {}),
        ...(room && Number.isInteger(room) && room > 0 ? { capacity: room } : {}),
      });
      const state = await refreshState(ctx).catch(() => null);
      redraw(state?.nights.find((x) => x.id === night.id) ?? saved, "Turnout saved.");
    } catch (err) {
      if (button) button.disabled = false;
      replace(slot, failure(err, () => form.requestSubmit()));
    }
  });
  return ledge({ label: "Turnout", className: "ledge-turnout" }, ...done, form);
}
