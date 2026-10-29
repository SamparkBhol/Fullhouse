import type { Night } from "../../../src/shared/contract.ts";
import { h, prefersReducedMotion, replace, safeHref } from "../dom.ts";
import { formatName, longDate, todayIn } from "../format.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { fitHeadlines, flyer } from "../ui/flyer.ts";
import { bigWindow } from "../ui/night-room.ts";
import { nightReceipts } from "../ui/night-receipts.ts";
import { ORDER, PUBLIC, forYouToSend, outOnTheStreet, takeDown } from "../ui/published-windows.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { turnoutWindow } from "../ui/turnout-form.ts";
import { ledgeRow } from "../ui/ledge.ts";
import { withVenue, type VenueCtx } from "../venue-context.ts";

export function publishedPage(id: string, nightId: string): Promise<void> {
  return withVenue(
    id,
    "nights",
    (ctx, main) => {
      const night = ctx.state.nights.find((n) => n.id === nightId) ?? sessionGet<Night>(`night.${nightId}`);
      if (!night) {
        title("Night not found");
        replace(
          main,
          h(
            "div",
            { class: "wrap" },
            h("h1", null, "This night is not here"),
            h("p", null, "It may have been deleted, or the link is incomplete."),
            h("p", null, h("a", { class: "button", href: `/v/${encodeURIComponent(id)}` }, "Back to your nights")),
          ),
        );
        focusHeading();
        return;
      }
      renderNight(ctx, main, night);
    },
    { fresh: true },
  );
}

// While the night is out, the one lamp lit button opens what guests see.
function eventLink(night: Night): HTMLElement | null {
  const page = night.actions.find((a) => a.kind === "event_page" && a.ok);
  const href = safeHref(page?.url);
  return href ? h("p", { class: "actions" }, h("a", { class: "button button-big button-lamp", href }, "Open the event page")) : null;
}

function rsvpRoom(night: Night, live: boolean): HTMLElement {
  return h(
    "div",
    { class: "rsvp-room" },
    h(
      "p",
      { class: "rsvp-line" },
      h("span", { class: live ? "rsvp-big lit-text" : "rsvp-big" }, String(night.rsvps)),
      h("span", { class: "rsvp-words" }, ` ${night.rsvps === 1 ? "person has" : "people have"} said they are coming.`),
    ),
    h("p", { class: "meta" }, "A count of people who pressed I am going on the event page, not tickets. It keeps no names and no emails."),
    live ? eventLink(night) : null,
  );
}

function lettering(night: Night, live: boolean, past: boolean): string {
  if (night.withdrawnAt) return "Taken down. The light is off.";
  if (live) return "On the street now";
  return past ? "The night is over. The tape stays, the light is off." : "Published";
}

function renderNight(ctx: VenueCtx, main: HTMLElement, night: Night, notice?: string): void {
  const venue = ctx.state.venue;
  const read = ctx.state.read;
  const justTaped = sessionGet<boolean>(`taped.${night.id}`) === true;
  if (justTaped) sessionSet(`taped.${night.id}`, false);
  title(night.copy?.eventTitle || formatName(night.format, night.feature?.type));
  const actions = [...night.actions].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const past = night.date < todayIn(venue.tz);
  const published = night.status === "approved" || night.status === "done";
  const live = published && !past && !night.withdrawnAt;
  const redraw = (n: Night, text: string): void => renderNight(ctx, main, n, text);
  const calls = read && read.at === night.readAt ? read.provenance : [];
  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide night-page" },
      h("h1", { class: "page-title" }, justTaped ? "Published" : `${formatName(night.format, night.feature?.type)}, ${longDate(night.date)}`),
      justTaped ? h("p", { class: "lede" }, "The night is out. Here is everything that went live.") : null,
      notice ? h("p", { class: "notice", role: "status" }, notice) : null,
      bigWindow({
        lettering: lettering(night, live, past),
        lit: live,
        dark: !live,
        flyer: flyer(night, venue, { live, taped: published, justTaped: justTaped && !prefersReducedMotion(), headingLevel: "h2" }),
        side: rsvpRoom(night, live),
      }),
      ledgeRow(
        "What went out with this night",
        outOnTheStreet(actions.filter((a) => PUBLIC.includes(a.kind)), live, past),
        forYouToSend(actions.filter((a) => !PUBLIC.includes(a.kind)), live),
        turnoutWindow(ctx, night, redraw),
      ),
      takeDown(ctx, night, redraw),
      nightReceipts(night, venue.entity.name, calls, venue.tz),
    ),
  );
  fitHeadlines(main);
  focusHeading();
}
