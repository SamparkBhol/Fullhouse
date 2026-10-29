import type { ActionKind, ActionResult, Night } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, safeHref } from "../dom.ts";
import { failure, loading } from "./states.ts";
import { refreshState, type VenueCtx } from "../venue-context.ts";
import { ledge } from "./ledge.ts";

export const ORDER: ActionKind[] = ["event_page", "poster", "ics", "gcal", "eventbrite", "outreach", "owner_email"];
export const PUBLIC: ActionKind[] = ["event_page", "poster", "ics", "gcal", "eventbrite"];

function externalAttrs(href: string): Record<string, string> {
  return href.startsWith(location.origin) || href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" };
}

// Outreach drafts come with the same note as a mail app, Gmail and Outlook link, so the owner sends it from their own account.
function composeLinks(a: ActionResult): HTMLElement | null {
  const links = (a.links ?? []).map((l) => ({ label: l.label, href: safeHref(l.url) })).filter((l): l is { label: string; href: string } => l.href !== null);
  if (!links.length) return null;
  return h(
    "ul",
    { class: "compose-links", "aria-label": "Open this draft in" },
    links.map((l) => h("li", null, h("a", { href: l.href, ...externalAttrs(l.href) }, l.label))),
  );
}

// Window light marks what is out on the street, so public links go dark once the night is over.
function actionItem(a: ActionResult, live: boolean, saidAbove = false): HTMLElement {
  const isPublic = PUBLIC.includes(a.kind) && live;
  const href = safeHref(a.url);
  if (!a.ok) {
    return h("li", { class: "result result-failed" }, h("p", { class: "result-label" }, a.label), h("p", { class: "result-detail" }, `Did not work. ${a.detail}`));
  }
  return h(
    "li",
    { class: "result" },
    href ? h("a", { class: isPublic ? "result-label lit-link" : "result-label", href, ...externalAttrs(href) }, a.label) : h("p", { class: "result-label" }, a.label),
    a.detail && !saidAbove ? h("p", { class: "result-detail" }, a.detail) : null,
    composeLinks(a),
  );
}

export function outOnTheStreet(actions: ActionResult[], live: boolean, past: boolean): HTMLElement {
  return ledge(
    { label: past ? "Still online" : "Out on the street", className: "ledge-out" },
    actions.length ? h("ul", { class: "results" }, actions.map((a) => actionItem(a, live))) : h("p", { class: "ledge-empty" }, "Nothing public was made for this night."),
  );
}

// Every draft usually carries the same note about addresses, so it is said once above them.
export function forYouToSend(actions: ActionResult[], live: boolean): HTMLElement | null {
  if (!actions.length) return null;
  const first = actions[0]?.detail;
  const shared = actions.length > 1 && first && actions.every((a) => a.ok && a.detail === first) ? first : null;
  return ledge(
    { label: "For you to send", className: "ledge-send" },
    shared ? h("p", { class: "ledge-shared ledge-shared-top" }, shared) : null,
    h("ul", { class: "results" }, actions.map((a) => actionItem(a, live, Boolean(shared)))),
  );
}

// The owner can take the public copy offline at any time and put it back as it was.
export function takeDown(ctx: VenueCtx, night: Night, redraw: (n: Night, notice: string) => void): HTMLElement | null {
  if (!night.eventSlug) return null;
  const offline = Boolean(night.withdrawnAt);
  const slot = h("div", { "aria-live": "polite" });
  const button = h("button", { class: offline ? "button" : "button button-danger", type: "button" }, offline ? "Put the page back up" : "Take the page down");
  button.addEventListener("click", async () => {
    button.disabled = true;
    replace(slot, loading(offline ? "Putting the page back up" : "Taking the page down"));
    try {
      const updated = offline ? await api.republish(ctx.id, ctx.token, night.id) : await api.unpublish(ctx.id, ctx.token, night.id);
      await refreshState(ctx).catch(() => undefined);
      redraw(updated, offline ? "The page, poster and calendar file are back online." : "The page, poster and calendar file are offline. Nothing else was undone.");
    } catch (err) {
      button.disabled = false;
      replace(slot, failure(err, () => button.click()));
    }
  });
  return ledge(
    { label: offline ? "Offline" : "Something wrong?", className: "ledge-down" },
    h("p", null, offline ? "The event page, poster and calendar file are offline. Eventbrite and any notes you sent are not touched." : "Take the event page, poster and calendar file offline. Eventbrite and notes you already sent stay as they are."),
    h("p", { class: "actions" }, button),
    slot,
  );
}
