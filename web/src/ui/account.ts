import { api, type Health } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { navigate } from "../router.ts";
import { forgetVenue, saveToken, sessionSet } from "../store.ts";
import { refreshState, type VenueCtx } from "../venue-context.ts";
import { failure, loading } from "./states.ts";
import { tapedNote } from "./taped.ts";

// A new link signs every other phone and every old email link out of this venue.
export function ownerLinkNote(ctx: VenueCtx): HTMLElement {
  const slot = h("div", { "aria-live": "polite" });
  const fresh = h("button", { class: "button button-ink", type: "button" }, "Make a new owner link");
  const forget = h("button", { class: "link-button", type: "button" }, "Forget this phone");
  fresh.addEventListener("click", async () => {
    fresh.disabled = true;
    replace(slot, loading("Making a new owner link"));
    try {
      const link = await api.newOwnerLink(ctx.id, ctx.token);
      saveToken(ctx.id, link.ownerToken);
      ctx.token = link.ownerToken;
      const field = h("input", { type: "text", readonly: true, value: link.ownerUrl, class: "owner-link", id: uid("link") });
      replace(slot, h("div", null, h("p", { class: "notice", role: "status" }, "Done. The old link no longer works. Save this one."), h("div", { class: "field" }, h("label", { for: field.id }, "New owner link"), field)));
    } catch (err) {
      replace(slot, failure(err, () => fresh.click()));
    }
    fresh.disabled = false;
  });
  forget.addEventListener("click", () => {
    forgetVenue(ctx.id);
    sessionSet("flash", "This phone no longer holds the owner link for that venue.");
    navigate("/", { replace: true });
  });
  return tapedNote(
    "Owner link",
    "Anyone with the owner link can manage this venue. If it went somewhere it should not, make a new one. Every other phone and old email link stops working.",
    h("p", { class: "actions" }, fresh, forget),
    slot,
  );
}

export function emailNote(ctx: VenueCtx, health: Health): HTMLElement {
  const venue = ctx.state.venue;
  if (!health.ownerEmail) return tapedNote("Email", "Email is off on this server, so Full House sends no email. Drafts wait on your venue page.");
  const input = h("input", { type: "email", id: uid("mail"), autocomplete: "email", inputmode: "email" });
  const slot = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form", novalidate: true },
    h("div", { class: "field" }, h("label", { for: input.id }, venue.ownerEmail || venue.pendingEmail ? "Use a different email" : "Your email"), input),
    h("p", { class: "actions" }, h("button", { class: "button button-ink", type: "submit" }, "Send a confirmation link")),
    slot,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.value.trim() || !input.checkValidity()) {
      replace(slot, h("p", { class: "form-error", role: "alert" }, "The email address does not look complete."));
      return;
    }
    try {
      await api.requestEmail(ctx.id, ctx.token, input.value.trim());
      await refreshState(ctx).catch(() => undefined);
      replace(slot, h("p", { class: "notice", role: "status" }, "Sent. Open the link in that email on this phone to confirm it."));
    } catch (err) {
      replace(slot, failure(err, () => form.requestSubmit()));
    }
  });
  return tapedNote(
    "Email",
    venue.ownerEmail ? `Confirmed: ${venue.ownerEmail}. It gets the Monday draft and the links to each night you publish.` : null,
    venue.pendingEmail ? `Waiting for you to confirm ${venue.pendingEmail} from the link we sent. Nothing else goes there until then.` : null,
    !venue.ownerEmail && !venue.pendingEmail ? "Optional. Give an email and it gets the Monday draft and the links to each night you publish." : null,
    form,
  );
}
