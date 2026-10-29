import { plainName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { readDate } from "../format.ts";
import { isCurrent, ticket } from "../router.ts";
import { warmImages } from "../ui/cover.ts";
import { serverProgress } from "../ui/progress.ts";
import { roomForm } from "../ui/room-form.ts";
import { credit, title } from "../ui/shell.ts";
import { failure } from "../ui/states.ts";
import { streetMapPanel } from "../ui/street-map.ts";
import { READ_STEPS, placesPanel, shelvesPanel } from "./crowd.ts";
import { firstPath, planOf, readOf, type Run } from "./run.ts";

export function limitsLine(name: string): HTMLElement {
  return h("p", { class: "limits-line" }, `A pattern across many people who like ${name}, not a fact about any one of them.`);
}

export function screenHead(heading: string, lead: string | null, ...rest: (HTMLElement | null)[]): HTMLElement {
  return h("div", { class: "screen-head" }, h("h1", { tabindex: "-1" }, heading), lead ? h("p", null, lead) : null, ...rest);
}

// The read takes seven to ten seconds. That wait is where the owner answers the three questions the planner must obey.
function whileReading(run: Run, reading: boolean): HTMLElement | null {
  const v = run.ctx.state.venue;
  if (!v.assumed?.slot && !v.assumed?.room && v.house) return null;
  return roomForm(run.ctx, { heading: reading ? "While it reads, three things about your room" : "Three things about your room", lead: "Full House assumed a quiet Tuesday from 19:00 and room for 40. Set the real ones, and say what your room can and cannot do." });
}

export async function crowdScreen(run: Run, main: HTMLElement): Promise<void> {
  const venue = run.ctx.state.venue;
  const name = plainName(venue.entity.name);
  title(`Your crowd, ${name}`);
  const head = screenHead(run.ctx.state.read ? "Your crowd" : `Reading the crowd of ${name}`, `What people who like ${name} love, on your street and on their shelves.`);
  const slot = h("div", { class: "screen-one" });
  replace(main, h("div", { class: "screen" }, h("div", { class: "wrap" }, head, slot)));
  head.querySelector("h1")?.focus({ preventScroll: true });
  const steps = run.ctx.state.read ? null : serverProgress(`Reading the crowd of ${name}`, READ_STEPS, () => api.progress(run.ctx.id, run.ctx.token));
  const asks = run.ctx.state.read ? null : whileReading(run, true);
  if (steps) replace(slot, h("section", { class: "panel" }, steps.el), asks);
  const at = ticket();
  try {
    const read = await readOf(run);
    steps?.finish();
    if (!isCurrent(at)) return;
    warmImages([venue.entity, read.match?.partner, ...read.match?.runnersUp ?? []]);
    const h1 = head.querySelector("h1");
    if (h1) h1.textContent = "Your crowd";
    credit(`Taste data from Qloo, read ${readDate(read.at, venue.tz)}. Map data from OpenStreetMap contributors. Ranked by Full House.`);
    void planOf(run).catch(() => undefined);
    const grid = h(
      "div",
      { class: "screen-grid" },
      h("div", { class: "stack" }, streetMapPanel(read, venue, { compact: true }), placesPanel(read, name), h("p", { class: "actions" }, h("a", { class: "btn", href: firstPath(run.ctx.id, "match") }, "See your partner"))),
      h("div", { class: "stack" }, shelvesPanel(read, name), whileReading(run, false)),
    );
    slot.replaceWith(grid);
    grid.after(limitsLine(name));
  } catch (err) {
    if (!isCurrent(at)) return;
    replace(slot, failure(err, () => void crowdScreen(run, main)));
  }
}
