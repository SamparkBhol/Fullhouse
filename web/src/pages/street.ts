import type { StreetRead } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { distance, moment } from "../format.ts";
import { lovedSection } from "../ui/loved.ts";
import { pickShelves } from "../ui/picks.ts";
import { receiptsDrawer } from "../ui/receipts.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { streetMapPanel } from "../ui/street-map.ts";
import { audiencePart, gapPart, lovedPart, mapPart, picksPart, tastePart } from "../ui/street-receipts.ts";
import { gapBoard } from "../ui/taste.ts";
import { shopWindow } from "../ui/window.ts";
import { refreshState, withVenue, type VenueCtx } from "../venue-context.ts";
import { READ_LINES, readThenPlan } from "../first-night.ts";

export function streetPage(id: string): Promise<void> {
  return withVenue(id, "street", (ctx, main) => {
    if (ctx.state.read) renderRead(ctx, main, ctx.state.read);
    else renderNoRead(ctx, main);
  });
}

function renderNoRead(ctx: VenueCtx, main: HTMLElement): void {
  title("The street");
  const slot = h("div", { "aria-live": "polite" });
  const button = h("button", { class: "button button-big", type: "button" }, "Read the street");
  button.addEventListener("click", () => void runRead(ctx, main, button, slot));
  replace(
    main,
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "The street around you"),
      shopWindow(
        { size: "big", dark: true, lettering: "Not read yet" },
        h("p", { class: "lede" }, "Full House asks Qloo five things about the blocks around your venue:"),
        h("ul", { class: "ticks" }, READ_LINES.map((l) => h("li", null, l))),
        h("p", null, "Only your venue's public listing and its location are sent. Nothing about your customers."),
        h("p", { class: "actions" }, button),
        slot,
      ),
    ),
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

function picksSection(read: StreetRead, venueName: string): HTMLElement {
  return h(
    "section",
    { class: "street-picks", "aria-labelledby": "picks-title" },
    h("h2", { id: "picks-title" }, `What people who like ${venueName} love`),
    read.rising.length
      ? h("div", { class: "pick-windows" }, pickShelves(read))
      : h("p", { class: "ledge-empty" }, `Qloo returned no artists, books, films, shows or podcasts for ${venueName}.`),
  );
}

function renderRead(ctx: VenueCtx, main: HTMLElement, read: StreetRead): void {
  const venue = ctx.state.venue;
  const tz = venue.tz;
  const name = venue.entity.name;
  title("The street");
  const again = h("button", { class: "link-button", type: "button" }, "Read again");
  const againSlot = h("div", { "aria-live": "polite" });
  again.addEventListener("click", () => void runRead(ctx, main, again, againSlot));
  const day = venue.quietSlot.weekday;
  const plan = h("button", { class: "button button-lamp", type: "button" }, "Plan a night from this read");
  plan.addEventListener("click", () => {
    plan.disabled = true;
    void readThenPlan(ctx.id, ctx.token, day, againSlot, false, () => (plan.disabled = false));
  });

  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide street-page" },
      h(
        "div",
        { class: "read-meta" },
        h("h1", { class: "page-title" }, "The street around you"),
        h("p", { class: "meta read-line" }, `Read ${moment(read.at, tz)}, ${distance(read.radiusM)} around ${name}. `, again),
        h("p", { class: "read-actions" }, plan),
        againSlot,
      ),
      streetMapPanel(read, venue),
      picksSection(read, name),
      lovedSection(read),
      gapBoard(read),
      receiptsDrawer({
        calls: read.provenance,
        limits: read.limits,
        tz,
        parts: [mapPart(read, tz), picksPart(read, name, tz), lovedPart(read, name, tz), gapPart(read, tz), tastePart(read, name, tz), audiencePart(read, name, tz)],
      }),
    ),
  );
  focusHeading();
}
