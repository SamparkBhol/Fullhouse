import type { StreetRead } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { distance, moment } from "../format.ts";
import { lovedSection } from "../ui/loved.ts";
import { pickGroups } from "../ui/picks.ts";
import { openReceipt, reasons } from "../ui/receipt.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { empty, failure, limitsLine, loading } from "../ui/states.ts";
import { streetMapPanel } from "../ui/street-map.ts";
import { gapSection, tasteSection } from "../ui/taste.ts";
import { refreshState, withVenue, type VenueCtx } from "../venue-context.ts";
import { READ_LINES } from "./venue.ts";

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
      h("p", { class: "lede" }, "Full House has not read the street yet. It asks Qloo five things about the blocks around your venue:"),
      h("ul", { class: "ticks" }, READ_LINES.map((l) => h("li", null, l))),
      h("p", null, "Only your venue's public listing and its location are sent. Nothing about your customers."),
      h("p", { class: "actions" }, button),
      slot,
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

function picksSection(read: StreetRead, venueName: string, tz: string): HTMLElement {
  return h(
    "section",
    { class: "block", "aria-labelledby": "picks-title" },
    h("h2", { id: "picks-title" }, `What people who like ${venueName} love`),
    h("p", { class: "meta" }, "Artists, books, films, shows and podcasts Qloo ties to your venue's audience, read with the streets around it. Ranked within each list."),
    read.rising.length ? pickGroups(read, tz) : empty(`Qloo returned no artists, books, films, shows or podcasts for ${venueName}.`),
  );
}

function audienceSection(read: StreetRead, venueName: string, tz: string): HTMLElement | null {
  if (!read.demographics) return null;
  return h(
    "section",
    { class: "block", "aria-labelledby": "demo-title" },
    h("h2", { id: "demo-title" }, "Who your audience is, in aggregate"),
    h("p", null, read.demographics.summary),
    reasons(
      [{ text: `Qloo demographics for people who like ${venueName}. It describes an audience, not any person.`, kind: "demographics", provenance: read.demographics.provenance }],
      read.provenance,
      tz,
    ),
  );
}

function renderRead(ctx: VenueCtx, main: HTMLElement, read: StreetRead): void {
  const venue = ctx.state.venue;
  const tz = venue.tz;
  const name = venue.entity.name;
  title("The street");
  const again = h("button", { class: "button button-quiet", type: "button" }, "Read again");
  const againSlot = h("div", { "aria-live": "polite" });
  again.addEventListener("click", () => void runRead(ctx, main, again, againSlot));
  const allCalls = h("button", { class: "button button-quiet", type: "button", onclick: () => openReceipt(read.provenance, null, { tz }) }, `All ${read.provenance.length} Qloo calls`);

  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide" },
      h("h1", { class: "page-title" }, "The street around you"),
      h(
        "div",
        { class: "read-meta" },
        h("p", { class: "meta" }, `Read ${moment(read.at, tz)}, ${distance(read.radiusM)} around ${name}.`),
        h("p", { class: "read-actions" }, allCalls, again),
        againSlot,
      ),
      h(
        "div",
        { class: "split split-map" },
        streetMapPanel(read, venue),
        h(
          "div",
          { class: "street-evidence" },
          tasteSection(read, name),
          gapSection(read, tz),
          picksSection(read, name, tz),
          lovedSection(read, tz),
          audienceSection(read, name, tz),
          limitsLine(read.limits),
        ),
      ),
    ),
  );
  focusHeading();
}
