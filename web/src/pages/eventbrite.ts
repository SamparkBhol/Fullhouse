import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { screenHead } from "../first-run/crowd-screen.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { note } from "../ui/account.ts";
import { refreshState, withVenue, type VenueCtx } from "../venue-context.ts";

export function disconnectLine(ctx: VenueCtx): HTMLElement {
  const slot = h("div", { "aria-live": "polite" });
  const button = h("button", { class: "link-btn", type: "button" }, "Disconnect Eventbrite");
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api.disconnectEventbrite(ctx.id, ctx.token);
      await refreshState(ctx).catch(() => undefined);
      replace(slot, h("p", { class: "notice", role: "status" }, "Disconnected. Full House no longer holds your Eventbrite token."));
      button.remove();
    } catch (err) {
      button.disabled = false;
      replace(slot, failure(err, () => button.click()));
    }
  });
  return h("div", null, button, slot);
}

export function eventbritePage(id: string): Promise<void> {
  return withVenue(id, "venue", (ctx, main) => {
    title("Connect Eventbrite");
    const venue = ctx.state.venue;
    const input = h("input", { type: "password", id: uid("eb"), autocomplete: "off", spellcheck: "false", required: true });
    const slot = h("div", { "aria-live": "polite" });
    const form = h(
      "form",
      { class: "form", novalidate: true },
      h("div", { class: "field-row" }, h("label", { for: input.id }, "Eventbrite private token"), input),
      h("p", { class: "actions actions-tight" }, h("button", { class: "btn", type: "submit" }, venue.eventbrite ? "Replace the token" : "Connect Eventbrite")),
      slot,
    );
    const task = note(
      "Where to find the token",
      venue.eventbrite
        ? h("p", { class: "notice" }, `Connected to ${venue.eventbrite.organization}. Approved nights can be created there.`)
        : "Optional. When it is connected, approving a night can also create it on your own Eventbrite account.",
      h(
        "ol",
        { class: "bullets steps-list" },
        h("li", null, "Sign in to Eventbrite on any device."),
        h(
          "li",
          null,
          "Open your API keys page at ",
          h("a", { href: "https://www.eventbrite.com/platform/api-keys", target: "_blank", rel: "noopener noreferrer" }, "eventbrite.com/platform/api-keys"),
          ". If there is no key yet, create one.",
        ),
        h("li", null, "Copy the private token and paste it below."),
      ),
      form,
      venue.eventbrite ? disconnectLine(ctx) : null,
    );
    const about = note(
      "What happens to the token",
      "Full House checks the token with one call to Eventbrite and shows the organisation it belongs to. It is stored encrypted, used only for nights you approve, and never shown again, not even to you.",
      "A private token can act on your whole Eventbrite account, and Full House only uses it to create nights you approve. Disconnect removes the token from Full House. To stop it working everywhere, also delete the key on Eventbrite.",
    );
    replace(main, h("div", { class: "screen" }, h("div", { class: "wrap" }, screenHead("Connect Eventbrite", "Optional. Approving a night can also create it on your own Eventbrite account."), h("div", { class: "screen-grid section-grid" }, task, about))));
    focusHeading();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        replace(slot, h("p", { class: "form-error", role: "alert" }, "Paste the private token first."));
        input.focus();
        return;
      }
      const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (button) button.disabled = true;
      replace(slot, loading("Checking the token with Eventbrite"));
      try {
        const org = await api.eventbrite(ctx.id, ctx.token, value);
        input.value = "";
        await refreshState(ctx).catch(() => undefined);
        if (button) button.disabled = false;
        replace(slot, h("p", { class: "notice", role: "status" }, `Connected to ${org}.`));
      } catch (err) {
        if (button) button.disabled = false;
        replace(slot, failure(err, () => form.requestSubmit()));
      }
    });
  });
}
