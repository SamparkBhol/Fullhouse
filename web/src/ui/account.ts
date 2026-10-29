import { api, type Health } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { navigate } from "../router.ts";
import { forgetVenue, saveToken, sessionSet } from "../store.ts";
import { refreshState, type VenueCtx } from "../venue-context.ts";
import { failure, loading } from "./states.ts";

// A new link signs every other phone and every old email link out of this venue.
export function ownerLinkBlock(ctx: VenueCtx): HTMLElement {
  const slot = h("div", { "aria-live": "polite" });
  const fresh = h("button", { class: "button", type: "button" }, "Make a new owner link");
  const forget = h("button", { class: "button button-quiet", type: "button" }, "Forget this phone");
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
  return h(
    "section",
    { class: "block", "aria-labelledby": "link-title" },
    h("h2", { id: "link-title" }, "Owner link"),
    h("p", null, "Anyone with the owner link can manage this venue. If it went somewhere it should not, make a new one. Every other phone and old email link stops working."),
    h("p", { class: "actions" }, fresh, forget),
    slot,
  );
}

export function emailBlock(ctx: VenueCtx, health: Health): HTMLElement {
  const venue = ctx.state.venue;
  const section = h("section", { class: "block", "aria-labelledby": "mail-title" }, h("h2", { id: "mail-title" }, "Email"));
  if (!health.ownerEmail) {
    section.append(h("p", null, "Email is off on this server, so Full House sends no email. Drafts wait on your venue page."));
    return section;
  }
  if (venue.ownerEmail) section.append(h("p", null, `Confirmed: ${venue.ownerEmail}. It gets the Monday draft and the links to each night you publish.`));
  if (venue.pendingEmail) section.append(h("p", null, `Waiting for you to confirm ${venue.pendingEmail} from the link we sent. Nothing else goes there until then.`));
  const input = h("input", { type: "email", id: uid("mail"), autocomplete: "email", inputmode: "email" });
  const slot = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form", novalidate: true },
    h("div", { class: "field" }, h("label", { for: input.id }, venue.ownerEmail || venue.pendingEmail ? "Use a different email" : "Your email"), input),
    h("p", { class: "actions" }, h("button", { class: "button", type: "submit" }, "Send a confirmation link")),
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
  section.append(form);
  return section;
}
