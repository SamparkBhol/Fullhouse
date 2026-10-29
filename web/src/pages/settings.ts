import type { Venue } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { zoneTime } from "../charts/time.ts";
import { slotShort } from "../format.ts";
import { navigate } from "../router.ts";
import { forgetVenue, sessionSet } from "../store.ts";
import { emailNote, note, ownerLinkNote } from "../ui/account.ts";
import { roomForm } from "../ui/room-form.ts";
import { screenHead } from "../first-run/crowd-screen.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { withVenue, type VenueCtx } from "../venue-context.ts";
import { disconnectLine } from "./eventbrite.ts";

function yesNo(v: boolean | undefined): string {
  return v === undefined ? "Not said yet" : v ? "Yes" : "No";
}

// What Full House holds about the venue, each fact on a ruled line. A default the owner never changed says so.
function venueCard(venue: Venue, emailOn: boolean): HTMLElement {
  const row = (label: string, value: string, assumed = false): Node[] => [h("dt", null, label), h("dd", null, value, assumed ? h("span", { class: "assumed" }, "assumed, change it below") : null)];
  const email = venue.ownerEmail ?? (venue.pendingEmail ? `${venue.pendingEmail}, not confirmed yet` : "Not given");
  return note(
    "What Full House holds",
    h("p", { class: "panel-lead" }, venue.entity.address ?? "No street address is listed for this place."),
    h(
      "dl",
      { class: "facts" },
      row("Quiet night", slotShort(venue.quietSlot), venue.assumed?.slot === true),
      row("Room", venue.capacity ? `${venue.capacity} people` : "Not set", venue.assumed?.room === true),
      row("Clock", zoneTime(venue.tz)),
      row("Recorded music", yesNo(venue.house?.music ?? (venue.noLiveMusic ? false : undefined))),
      row("A stage with its own programme", yesNo(venue.house?.stage)),
      row("Room for a spoken event", yesNo(venue.house?.spoken)),
      row("Your email", email),
      row("Confirmed as the venue", venue.verified ? "Yes, by an email on the venue's own website domain" : "Not yet. Public pages mark the venue as unconfirmed."),
    ),
    emailOn ? null : h("p", { class: "hint" }, "Monday drafts wait on your venue page."),
  );
}

function eventbriteNote(ctx: VenueCtx): HTMLElement {
  const eb = ctx.state.venue.eventbrite;
  return note(
    "Eventbrite",
    eb ? `Connected to ${eb.organization}. Approved nights can be created there.` : "Not connected. When it is, approving a night can also create it on your own Eventbrite account.",
    h("p", { class: "actions actions-tight" }, h("a", { class: "btn btn-quiet", href: `/v/${encodeURIComponent(ctx.id)}/eventbrite` }, eb ? "Change Eventbrite" : "Connect Eventbrite")),
    eb ? disconnectLine(ctx) : null,
  );
}

function deleteSection(ctx: VenueCtx): HTMLElement {
  const venue = ctx.state.venue;
  const confirm = h("input", { type: "checkbox", id: uid("sure") });
  const slot = h("div", { "aria-live": "polite" });
  const del = h("button", { class: "btn btn-danger", type: "submit" }, "Delete the venue");
  const form = h(
    "form",
    { class: "form", novalidate: true },
    h(
      "div",
      { class: "check-row" },
      confirm,
      h(
        "label",
        { for: confirm.id },
        h("strong", null, `Delete ${venue.entity.name} and everything about it`),
        h("span", null, "The street reads, plans, nights, RSVP counts, turnout, your email and the Eventbrite token. Event pages already published stop working. This cannot be undone."),
      ),
    ),
    h("p", { class: "actions actions-tight" }, del),
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
  return note(
    "What is kept, and deleting it",
    "Your venue's public listing, the street reads, your plans and nights, RSVP counts and the turnout you log. Your email and turnout stay with your venue and are never sent for taste data. A venue nobody opens for 8 weeks stops its Monday runs, and after 6 months it is deleted with everything in it.",
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
        { class: "screen" },
        h(
          "div",
          { class: "wrap" },
          screenHead("Your venue", `${ctx.state.venue.entity.name}, ${ctx.state.venue.city}.`),
          h(
            "div",
            { class: "screen-grid section-grid" },
            h("div", { class: "stack" }, venueCard(ctx.state.venue, health.ownerEmail), roomForm(ctx, { heading: "About your room", lead: "The next plan follows these.", onSaved: () => void settingsPage(ctx.id) }), deleteSection(ctx)),
            h("div", { class: "stack" }, eventbriteNote(ctx), health.ownerEmail ? emailNote(ctx, health) : null, ownerLinkNote(ctx)),
          ),
        ),
      ),
    );
    focusHeading();
  });
}
