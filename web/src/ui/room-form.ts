import type { HouseRules, QuietSlot, Venue, VenueSettingsInput } from "../../../src/shared/contract.ts";
import { weekdayName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { WEEKDAY_ORDER } from "../format.ts";
import { failure } from "./states.ts";
import type { VenueCtx } from "../venue-context.ts";
import { refreshState } from "../venue-context.ts";

const STARTS = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];

const RULES: Array<{ key: keyof HouseRules; ask: string }> = [
  { key: "music", ask: "Recorded music plays in your room" },
  { key: "stage", ask: "You have a stage with its own programme" },
  { key: "spoken", ask: "There is room for a spoken event, such as a quiz or a book club" },
];

function yesNo(name: string, value: boolean | undefined): { el: HTMLElement; read: () => boolean | undefined } {
  const group = uid(name);
  const opts = (["yes", "no"] as const).map((v) => {
    const id = `${group}-${v}`;
    const input = h("input", { type: "radio", class: "seg-input", name: group, id, value: v, checked: value === (v === "yes") });
    return h("span", { class: "seg-option" }, input, h("label", { class: "seg-pill", for: id }, v === "yes" ? "Yes" : "No"));
  });
  const el = h("div", { class: "seg-options", role: "group" }, ...opts);
  return { el, read: () => (el.querySelector<HTMLInputElement>("input:checked")?.value === "yes" ? true : el.querySelector<HTMLInputElement>("input:checked") ? false : undefined) };
}

// The three things the grammar must obey, the quiet night and the room size. Defaults are marked as assumed until
// the owner saves, and the Save button only sends what was given.
export function roomForm(ctx: VenueCtx, opts: { heading: string; lead: string; onSaved?: (v: Venue) => void } = { heading: "About your room", lead: "" }): HTMLElement {
  const venue = ctx.state.venue;
  const day = h("select", { "aria-label": "Quiet night" }, WEEKDAY_ORDER.map((d) => h("option", { value: String(d), selected: d === venue.quietSlot.weekday }, `${weekdayName(d)}s`))) as HTMLSelectElement;
  const start = h("select", { "aria-label": "Start time" }, [...new Set([...STARTS, venue.quietSlot.start])].sort().map((t) => h("option", { value: t, selected: t === venue.quietSlot.start }, t))) as HTMLSelectElement;
  const room = h("input", { type: "number", min: "1", max: "5000", inputmode: "numeric", "aria-label": "Room size", value: venue.capacity ? String(venue.capacity) : "", placeholder: "How many fit" }) as HTMLInputElement;
  const contact = h("input", { type: "text", maxlength: "120", autocomplete: "off", "aria-label": "How a partner reaches you", value: venue.contact ?? "", placeholder: "A phone number or an email, for partners only" }) as HTMLInputElement;
  const rules = RULES.map((r) => ({ ...r, ...yesNo(r.key, venue.house?.[r.key]) }));
  const status = h("div", { "aria-live": "polite" });
  const save = h("button", { class: "btn", type: "submit" }, "Save");
  const assumed = (on: boolean | undefined) => (on ? h("span", { class: "assumed" }, "assumed") : null);
  const form = h(
    "form",
    { class: "form room-form", novalidate: true },
    h("div", { class: "row" }, h("label", { class: "field-row" }, h("span", { class: "label" }, "Quiet night", assumed(venue.assumed?.slot)), day), h("label", { class: "field-row" }, h("span", { class: "label" }, "From"), start), h("label", { class: "field-row" }, h("span", { class: "label" }, "Room", assumed(venue.assumed?.room)), room)),
    h("div", null, ...rules.map((r) => h("div", { class: "yesno" }, h("span", null, r.ask), r.el))),
    h("label", { class: "field-row" }, h("span", { class: "label" }, "How a partner reaches you after its yes"), contact),
    h("p", { class: "actions actions-tight" }, save),
    status,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const house: HouseRules = {};
    for (const r of rules) {
      const v = r.read();
      if (v !== undefined) house[r.key] = v;
    }
    const slot: QuietSlot = { weekday: Number(day.value) as QuietSlot["weekday"], start: start.value, durationMin: venue.quietSlot.durationMin };
    const n = Number(room.value);
    const input: VenueSettingsInput = { quietSlot: slot, house, contact: contact.value.trim() || null };
    if (room.value.trim()) input.capacity = Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
    save.disabled = true;
    try {
      const saved = await api.settings(ctx.id, ctx.token, input);
      ctx.state.venue = saved;
      await refreshState(ctx).catch(() => undefined);
      replace(status, h("p", { class: "notice", role: "status" }, "Saved. The next plan follows it."));
      opts.onSaved?.(saved);
    } catch (err) {
      replace(status, failure(err, () => form.requestSubmit()));
    } finally {
      save.disabled = false;
    }
  });
  const id = uid("room");
  return h("section", { class: "panel", "aria-labelledby": id }, h("h2", { id }, opts.heading), opts.lead ? h("p", null, opts.lead) : null, form);
}
