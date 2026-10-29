import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { slotShort } from "../format.ts";
import { navigate } from "../router.ts";
import { forgetVenue, sessionSet } from "../store.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { emailBlock, ownerLinkBlock } from "../ui/account.ts";
import { withVenue } from "../venue-context.ts";
import { disconnectBlock } from "./eventbrite.ts";

export function settingsPage(id: string): Promise<void> {
  return withVenue(id, "venue", async (ctx, main) => {
    const venue = ctx.state.venue;
    const health = await api.health();
    title("Your venue");
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
        h("label", { for: confirm.id }, h("strong", null, `Delete ${venue.entity.name} and everything about it`), h("span", null, "The street reads, plans, nights, RSVP counts, turnout, your email and the Eventbrite token. Event pages already published stop working. This cannot be undone.")),
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
    replace(
      main,
      h(
        "div",
        { class: "wrap" },
        h("h1", null, "Your venue"),
        h(
          "dl",
          { class: "facts" },
          h("dt", null, "Place on Qloo"),
          h("dd", null, venue.entity.name, venue.entity.address ? h("span", { class: "meta block-line" }, venue.entity.address) : null),
          h("dt", null, "Quiet night"),
          h("dd", null, slotShort(venue.quietSlot)),
          h("dt", null, "Fits"),
          h("dd", null, venue.capacity ? `${venue.capacity} people` : "Not set"),
          h("dt", null, "Time zone"),
          h("dd", null, venue.tz.replace(/_/g, " ")),
          h("dt", null, "Your email"),
          h("dd", null, venue.ownerEmail ?? (venue.pendingEmail ? `${venue.pendingEmail}, not confirmed yet` : "Not given")),
          h("dt", null, "Confirmed as the venue"),
          h("dd", null, venue.verified ? "Yes, by an email on the venue's own website domain" : "Not yet. Public pages say the venue has not confirmed them."),
          h("dt", null, "Live music"),
          h("dd", null, venue.noLiveMusic ? "Left out of plans" : "Allowed"),
          h("dt", null, "Eventbrite"),
          h("dd", null, venue.eventbrite ? `Connected to ${venue.eventbrite.organization}` : "Not connected"),
        ),
        h("p", { class: "actions" }, h("a", { class: "button button-quiet", href: `/v/${encodeURIComponent(ctx.id)}/eventbrite` }, venue.eventbrite ? "Change Eventbrite" : "Connect Eventbrite")),
        venue.eventbrite ? disconnectBlock(ctx) : null,
        emailBlock(ctx, health),
        ownerLinkBlock(ctx),
        h(
          "section",
          { class: "block", "aria-labelledby": "data-title" },
          h("h2", { id: "data-title" }, "What is kept"),
          h(
            "p",
            null,
            "Your venue's public listing, the street reads, your plans and nights, RSVP counts and the turnout you log. Your email and turnout stay with your venue and are never sent to Qloo.",
          ),
          h("p", null, "A venue nobody opens for 8 weeks stops its Monday runs. After 6 months it is deleted with everything in it."),
          h("p", null, h("a", { href: "/how" }, "How Full House works")),
        ),
        h("section", { class: "block danger", "aria-labelledby": "del-title" }, h("h2", { id: "del-title" }, "Delete the venue"), form),
      ),
    );
    focusHeading();
  });
}
