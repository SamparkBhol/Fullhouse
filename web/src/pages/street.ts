import type { StreetRead } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { READ_LINES, readThenPlan } from "../first-night.ts";
import { placesPanel, shelvesPanel } from "../first-run/crowd.ts";
import { limitsLine, screenHead } from "../first-run/crowd-screen.ts";
import { distance, moment, readDate } from "../format.ts";
import { credit, focusHeading, title } from "../ui/shell.ts";
import { sourcesDrawer } from "../ui/sources.ts";
import { failure, loading } from "../ui/states.ts";
import { gapPart, lovedPart, mapPart, picksPart, tagsPart } from "../ui/street-sources.ts";
import { streetMapPanel } from "../ui/street-map.ts";
import { gapPanel, tastePanel } from "../ui/taste.ts";
import { refreshState, withVenue, type VenueCtx } from "../venue-context.ts";

const PICKS_PER_KIND = 6;

export function streetPage(id: string): Promise<void> {
  return withVenue(id, "street", (ctx, main) => {
    if (ctx.state.read) renderRead(ctx, main, ctx.state.read);
    else renderNoRead(ctx, main);
  });
}

function frame(main: HTMLElement, ...children: (HTMLElement | null)[]): void {
  replace(main, h("div", { class: "screen" }, h("div", { class: "wrap" }, ...children)));
}

function renderNoRead(ctx: VenueCtx, main: HTMLElement): void {
  title("Your street");
  const slot = h("div", { "aria-live": "polite" });
  const button = h("button", { class: "btn", type: "button" }, "Read the street");
  button.addEventListener("click", () => void runRead(ctx, main, button, slot));
  frame(
    main,
    screenHead("Your street", "Not read yet. Only your venue's public listing and its location are sent, nothing about your customers."),
    h("section", { class: "panel screen-one" }, h("h2", null, "A read covers"), h("ul", { class: "bullets" }, READ_LINES.map((l) => h("li", null, l))), h("p", { class: "actions" }, button), slot),
  );
  focusHeading();
}

async function runRead(ctx: VenueCtx, main: HTMLElement, button: HTMLButtonElement, slot: HTMLElement): Promise<void> {
  button.disabled = true;
  replace(slot, loading("Reading the street around your venue", READ_LINES));
  try {
    const read = await api.read(ctx.id, ctx.token);
    await refreshState(ctx).catch(() => undefined);
    renderRead(ctx, main, ctx.state.read ?? read);
  } catch (err) {
    button.disabled = false;
    replace(slot, failure(err, () => void runRead(ctx, main, button, slot)));
  }
}

function renderRead(ctx: VenueCtx, main: HTMLElement, read: StreetRead): void {
  const venue = ctx.state.venue;
  const tz = venue.tz;
  const name = plainName(venue.entity.name);
  title("Your street");
  credit(`Taste data from Qloo, read ${readDate(read.at, tz)}. Map data from OpenStreetMap contributors. Ranked by Full House.`);
  const slot = h("div", { "aria-live": "polite" });
  const again = h("button", { class: "btn btn-quiet", type: "button" }, "Read again");
  again.addEventListener("click", () => void runRead(ctx, main, again, slot));
  const plan = h("button", { class: "btn", type: "button" }, "Plan a night from this read");
  plan.addEventListener("click", () => {
    plan.disabled = true;
    void readThenPlan(ctx.id, ctx.token, venue.quietSlot.weekday, slot, false, () => (plan.disabled = false));
  });
  frame(
    main,
    screenHead("Your street", `Read ${moment(read.at, tz)}, ${distance(read.radiusM)} around ${name}.`, h("p", { class: "actions actions-tight" }, plan, again), slot),
    h("div", { class: "screen-grid" }, streetMapPanel(read, venue), placesPanel(read, name)),
    h("div", { class: "section-grid shelves-wide" }, shelvesPanel(read, name, PICKS_PER_KIND)),
    h("div", { class: "screen-grid screen-grid-even section-grid" }, gapPanel(read), tastePanel(read, name)),
    limitsLine(name),
    sourcesDrawer({
      calls: read.provenance,
      limits: read.limits,
      tz,
      parts: [mapPart(read, tz), picksPart(read, name, tz), lovedPart(read, name, tz), gapPart(read, tz), tagsPart(read, name, tz)],
    }),
  );
  focusHeading();
}
