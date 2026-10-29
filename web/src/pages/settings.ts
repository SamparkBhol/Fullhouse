import type { Venue } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { zoneTime } from "../charts/time.ts";
import { slotShort } from "../format.ts";
import { navigate } from "../router.ts";
import { forgetVenue, sessionSet } from "../store.ts";
import { emailNote, ownerLinkNote } from "../ui/account.ts";
import { noteFrame } from "../ui/note-frame.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { tapedNote } from "../ui/taped.ts";
import { withVenue, type VenueCtx } from "../venue-context.ts";
import { disconnectLine } from "./eventbrite.ts";

// The venue's card in its own window: what Full House holds about it, each fact on a ruled line like the hours card.
function venueCard(venue: Venue, emailOn: boolean): HTMLElement {
  const row = (label: string, value: string): Node[] => [h("dt", null, label), h("dd", null, value)];
  const email = venue.ownerEmail ?? (venue.pendingEmail ? `${venue.pendingEmail}, not confirmed yet` : "Not given");
  const card = tapedNote(
    venue.entity.name,
    h("p", { class: "venue-card-where" }, venue.entity.address ?? "Qloo has no street address for this place."),
    h(
      "dl",
      { class: "facts note-facts" },
      row("Quiet night", slotShort(venue.quietSlot)),
      row("Room", venue.capacity ? `${venue.capacity} people` : "Not set"),
      row("Clock", zoneTime(venue.tz)),
      row("Live music", venue.noLiveMusic ? "Left out of plans" : "Allowed"),
      row("Your email", email),
      row("Confirmed as the venue", venue.verified ? "Yes, by an email on the venue's own website domain" : "Not yet, so public pages say so"),
    ),
    emailOn ? null : h("p", { class: "hint" }, "Email is off on this server, so Monday drafts wait on your venue page."),
  );
  card.classList.add("venue-card");
  return card;
}

function eventbriteNote(ctx: VenueCtx): HTMLElement {
  const eb = ctx.state.venue.eventbrite;
  return tapedNote(
    "Eventbrite",
    eb ? `Connected to ${eb.organization}. Approved nights can be created there.` : "Not connected. When it is, approving a night can also create it on your own Eventbrite account.",
    h("p", { class: "actions" }, h("a", { class: "button button-ink", href: `/v/${encodeURIComponent(ctx.id)}/eventbrite` }, eb ? "Change Eventbrite" : "Connect Eventbrite")),
    eb ? disconnectLine(ctx) : null,
  );
}

function deleteSection(ctx: VenueCtx): HTMLElement {
  const venue = ctx.state.venue;
  const confirm = h("input", { type: "checkbox", id: uid("sure") });
  const slot = h("div", { "aria-live": "polite" });
  const del = h("button", { class: "button button-danger", type: "submit" }, "Delete the venue");
  const form = h(
    "form",
    { class: "form", novalidate: true },
    h(
      "div",
      { class: "check" },
      confirm,
      h(
        "label",
        { for: confirm.id },
        h("strong", null, `Delete ${venue.entity.name} and everything about it`),
        h("span", null, "The street reads, plans, nights, RSVP counts, turnout, your email and the Eventbrite token. Event pages already published stop working. This cannot be undone."),
      ),
    ),
    h("p", { class: "actions" }, del),
    slot,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!confirm.checked) {
      replace(slot, h("p", { class: "form-error", role: "alert" }, "Tick the box first to confirm."));
      confirm.focus();
      return;
    }
    del.disabled = true;
    replace(slot, loading(`Deleting ${venue.entity.name}`));
    try {
      await api.remove(ctx.id, ctx.token);
      forgetVenue(ctx.id);
      sessionSet("flash", `${venue.entity.name} is deleted. Nothing about it is kept.`);
      navigate("/", { replace: true });
    } catch (err) {
      del.disabled = false;
      replace(slot, failure(err, () => form.requestSubmit()));
    }
  });
  return h(
    "section",
    { class: "kept", "aria-labelledby": "kept-title" },
    h("h2", { id: "kept-title" }, "What is kept, and deleting it"),
    h(
      "p",
      null,
      "Your venue's public listing, the street reads, your plans and nights, RSVP counts and the turnout you log. Your email and turnout stay with your venue and are never sent to Qloo. A venue nobody opens for 8 weeks stops its Monday runs, and after 6 months it is deleted with everything in it.",
    ),
    form,
  );
}

export function settingsPage(id: string): Promise<void> {
  return withVenue(id, "venue", async (ctx, main) => {
    const health = await api.health();
    title("Your venue");
    replace(
      main,
      h(
        "div",
        { class: "wrap wrap-wide notes-page" },
        h("h1", null, "Your venue"),
        noteFrame("Your venue", venueCard(ctx.state.venue, health.ownerEmail), h("div", { class: "note-tasks" }, eventbriteNote(ctx), health.ownerEmail ? emailNote(ctx, health) : null, ownerLinkNote(ctx))),
        deleteSection(ctx),
      ),
    );
    focusHeading();
  });
}
