import type { Night } from "../../../src/shared/contract.ts";
import { plural } from "../../../src/shared/words.ts";
import { h, replace, safeHref } from "../dom.ts";
import { nightKind, readDate, todayIn } from "../format.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { api } from "../api.ts";
import { evening, eveningNotes, featurePick } from "../ui/evening.ts";
import { linksPanel } from "../ui/ledger.ts";
import { failure, loading } from "../ui/states.ts";
import { editedCopy, wordsFieldset } from "../ui/words-form.ts";
import { nightSources } from "../ui/night-sources.ts";
import { ORDER, PUBLIC, forYouToSend, publicLinks, takeDown } from "../ui/published-parts.ts";
import { credit, focusHeading, title } from "../ui/shell.ts";
import { turnoutWindow } from "../ui/turnout-form.ts";
import { refreshState, withVenue, type VenueCtx } from "../venue-context.ts";
import { screenHead } from "../first-run/crowd-screen.ts";
import { nightHeading } from "../first-run/night-screen.ts";

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
            { class: "screen" },
            h("div", { class: "wrap" }, screenHead("This night is not here", "It may have been deleted, or the link is incomplete."), h("p", { class: "actions" }, h("a", { class: "btn", href: `/v/${encodeURIComponent(id)}` }, "Back to your nights"))),
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

// A night just put out has no yes yet, and a big zero would be the loudest thing on the page, so it waits for the first one.
function rsvpBlock(night: Night, live: boolean): HTMLElement {
  const page = night.actions.find((a) => a.kind === "event_page" && a.ok);
  const href = safeHref(page?.url);
  return h(
    "div",
    { class: "rsvp-block" },
    night.rsvps > 0
      ? h("p", { class: "rsvp-line" }, h("span", { class: "rsvp-big" }, String(night.rsvps)), h("span", null, ` ${night.rsvps === 1 ? "person has" : "people have"} said they are coming.`))
      : h("p", { class: "rsvp-line" }, live ? "Nobody has pressed I am going yet. The count shows here when they do." : "Nobody pressed I am going on the event page."),
    h("p", { class: "small" }, "A count of people who pressed I am going on the event page, not tickets. It keeps no names and no emails."),
    live && href ? h("p", { class: "actions actions-tight" }, h("a", { class: "btn", href }, "Open the event page")) : null,
  );
}

function stateLine(night: Night, live: boolean, past: boolean): string {
  if (night.withdrawnAt) return "Taken down. The event page, poster and calendar file are offline.";
  if (live) return `Published. ${plural(night.rsvps, "person has", "people have")} said yes so far.`;
  return past ? "The night is over." : "Published.";
}

// The owner can change the words after publishing; the page, poster and calendar file read the new ones at once.
function editWords(ctx: VenueCtx, night: Night, redraw: (n: Night, notice: string) => void): HTMLElement | null {
  if (!night.eventSlug || night.withdrawnAt) return null;
  const inputs = new Map<keyof Night["copy"] & ("eventTitle" | "eventDescription" | "posterHeadline" | "posterSub"), HTMLInputElement | HTMLTextAreaElement>();
  const status = h("div", { "aria-live": "polite" });
  const form = h("form", { class: "form", novalidate: true }, wordsFieldset(night, inputs, { legend: "Change the words", pitch: false }), h("p", { class: "actions actions-tight" }, h("button", { class: "btn btn-quiet", type: "submit" }, "Save the words")), status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const copy = editedCopy(night, inputs);
    if (!copy) {
      replace(status, h("p", { class: "notice", role: "status" }, "Nothing changed."));
      return;
    }
    replace(status, loading("Saving the words"));
    try {
      const updated = await api.editNight(ctx.id, ctx.token, night.id, copy);
      await refreshState(ctx).catch(() => undefined);
      redraw(updated, "The words are saved. The event page, poster and calendar file read them now.");
    } catch (err) {
      replace(status, failure(err, () => form.requestSubmit()));
    }
  });
  return h("details", { class: "disclose more panel", id: "edit-words" }, h("summary", null, "Change the words on the page"), form);
}

function reportsLine(night: Night): HTMLElement | null {
  if (!night.reports) return null;
  return h("p", { class: "meta" }, `${plural(night.reports, "person has", "people have")} reported the page. Three different people take it offline.`);
}

function renderNight(ctx: VenueCtx, main: HTMLElement, night: Night, notice?: string): void {
  const venue = ctx.state.venue;
  const read = ctx.state.read;
  const justOut = sessionGet<boolean>(`justout.${night.id}`) === true;
  if (justOut) sessionSet(`justout.${night.id}`, false);
  title(night.copy?.eventTitle || nightKind(night));
  credit(`Taste data from Qloo, read ${readDate(night.readAt, venue.tz)}. Plan and count by Full House.`);
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
      { class: "screen" },
      h(
        "div",
        { class: "wrap" },
        screenHead(justOut ? "Published" : nightHeading(night), justOut ? "The night is out. Here is everything that went live." : stateLine(night, live, past)),
        notice ? h("p", { class: "notice section-tight", role: "status" }, notice) : null,
        h(
          "div",
          { class: "screen-grid" },
          h(
            "div",
            { class: "stack" },
            h(
              "section",
              { class: "panel", "aria-labelledby": "evening-title" },
              h("div", { class: "panel-head" }, h("h2", { id: "evening-title" }, night.copy?.eventTitle || nightKind(night)), h("span", { class: live ? "chip chip-yes" : "chip chip-line" }, night.withdrawnAt ? "Offline" : live ? "Published" : past ? "Over" : "Published")),
              evening(night, venue, { partnerProposed: Boolean(night.pair) && !night.invites?.some((i) => i.status === "accepted" && i.confirmed && (i.confirmed.start || i.confirmed.what)) }),
              eveningNotes(night),
              featurePick(night, venue),
              rsvpBlock(night, live),
              reportsLine(night),
            ),
            editWords(ctx, night, redraw),
            turnoutWindow(ctx, night, redraw),
          ),
          h(
            "div",
            { class: "stack" },
            linksPanel(night),
            publicLinks(actions.filter((a) => PUBLIC.includes(a.kind)), past),
            forYouToSend(actions.filter((a) => !PUBLIC.includes(a.kind))),
            takeDown(ctx, night, redraw),
          ),
        ),
        nightSources(night, venue.entity.name, calls, venue.tz),
      ),
    ),
  );
  focusHeading();
}
