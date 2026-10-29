import type { ActionKind, NightPlan } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, prefersReducedMotion, replace, uid } from "../dom.ts";
import { formatName, longDate } from "../format.ts";
import { planMatch, type Invite } from "../joint.ts";
import { isCurrent, navigate, ticket } from "../router.ts";
import { sessionSet } from "../store.ts";
import { cover } from "../ui/cover.ts";
import { displayTitle } from "../ui/flyer.ts";
import { shortName, splitBar } from "../ui/split-bar.ts";
import { failure, loading } from "../ui/states.ts";
import { refreshState, type VenueCtx } from "../venue-context.ts";
import { firstPath, ownerLink, rememberInvite } from "./run.ts";
import { copyButton, inviteNote, sendInvite } from "./share.ts";

const POLL_MS = 3000;
const PUBLISH: ActionKind[] = ["event_page", "poster", "ics", "gcal"];

export function nightTitle(plan: NightPlan): string {
  const kind = formatName(plan.format, plan.feature?.type);
  return plan.feature ? `${kind} for ${displayTitle(plan.feature.name)}, ${longDate(plan.date)} at ${plan.start}` : `${kind}, ${longDate(plan.date)} at ${plan.start}`;
}

function pair(ctx: VenueCtx, invite: Invite, plan: NightPlan | null): HTMLElement {
  const venue = ctx.state.venue.entity;
  const split = plan ? planMatch(plan)?.split : null;
  return h(
    "div",
    { class: "ask-side" },
    h(
      "div",
      { class: "ask-pair" },
    h("figure", { class: "ask-place" }, cover(venue, { shape: "square", className: "ask-photo", eager: true }), h("figcaption", null, plainName(venue.name))),
      h("figure", { class: "ask-place ask-theirs" }, cover(invite.partner, { shape: "square", className: "ask-photo", eager: true }), h("figcaption", null, shortName(invite.partner.name))),
    ),
    split ? splitBar(split, venue.name, invite.partner.name) : null,
  );
}

function linkBox(ctx: VenueCtx, invite: Invite, plan: NightPlan | null): HTMLElement {
  const field = h("input", { type: "text", readonly: true, value: invite.url, id: uid("invite"), class: "invite-link" });
  const copy = copyButton("Copy the link", () => invite.url, field);
  const again = h("button", { class: "button button-quiet", type: "button" }, "Send it again");
  again.addEventListener("click", () => void sendInvite(invite, inviteNote(invite, ctx.state.venue.entity.name, plan ? nightTitle(plan) : "a night together")));
  return h(
    "div",
    { class: "ask-link" },
    h("label", { for: field.id }, "Their invite link"),
    field,
    h("p", { class: "actions" }, again, copy.button),
    copy.status,
  );
}

function ownerNote(ctx: VenueCtx): HTMLElement {
  const url = ownerLink(ctx);
  const field = h("input", { type: "text", readonly: true, value: url, id: uid("owner"), class: "owner-link" });
  const copy = copyButton("Copy your owner link", () => url, field);
  return h(
    "details",
    { class: "owner-note" },
    h("summary", null, "Open your venue on another phone"),
    h("p", null, "This phone stays signed in. Your owner link opens the venue anywhere else. Anyone who has it can publish nights for you, so keep it to yourself."),
    h("label", { for: field.id, class: "sr-only" }, "Owner link"),
    field,
    h("p", { class: "actions" }, copy.button),
    copy.status,
  );
}

async function publish(ctx: VenueCtx, invite: Invite, slot: HTMLElement, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  replace(slot, loading("Publishing the night"));
  try {
    const night = await api.approve(ctx.id, ctx.token, invite.planId, { actions: PUBLISH });
    sessionSet(`taped.${night.id}`, true);
    sessionSet(`night.${night.id}`, night);
    await refreshState(ctx).catch(() => undefined);
    navigate(`/v/${encodeURIComponent(ctx.id)}/nights/${encodeURIComponent(night.id)}`, { replace: true });
  } catch (err) {
    button.disabled = false;
    replace(slot, failure(err, () => void publish(ctx, invite, slot, button)));
  }
}

function answered(ctx: VenueCtx, invite: Invite, body: HTMLElement): void {
  const them = shortName(invite.partner.name);
  if (invite.status === "declined") {
    replace(
      body,
      h("p", { class: "ask-say" }, `${them} said not this time. Nothing went out under either name.`),
      h("p", { class: "actions" }, h("a", { class: "button button-big button-lamp", href: firstPath(ctx.id, "match") }, "Pick another place")),
    );
    return;
  }
  const slot = h("div", { "aria-live": "polite" });
  const button = h("button", { class: "button button-big button-lamp", type: "button" }, "Publish the night");
  button.addEventListener("click", () => void publish(ctx, invite, slot, button));
  replace(
    body,
    h("p", { class: "ask-say" }, `Publishing puts up the event page with both your names, makes the poster and makes the calendar file. Nothing else goes out.`),
    h("p", { class: "actions" }, button),
    slot,
  );
}

export function askScreen(ctx: VenueCtx, main: HTMLElement, invite: Invite, plan: NightPlan | null): void {
  const them = shortName(invite.partner.name);
  const heading = h("h1", { class: "first-line first-line-ask", tabindex: "-1" });
  const body = h("div", { class: "ask-body" });
  const view = h("div", { class: "wrap wrap-wide first ask" }, h("div", { class: "ask-grid" }, heading, pair(ctx, invite, plan), body));
  const show = (inv: Invite, flipped: boolean): void => {
    view.dataset.status = inv.status;
    rememberInvite(ctx.id, inv);
    if (inv.status === "waiting") {
      heading.textContent = `Waiting for ${them}`;
      replace(
        body,
        h("p", { class: "ask-say" }, `The invite is with ${them}. When they press We're in on their page, this screen changes on its own.`),
        plan ? h("p", { class: "ask-night" }, nightTitle(plan)) : null,
        linkBox(ctx, inv, plan),
        ownerNote(ctx),
      );
      return;
    }
    heading.textContent = inv.status === "accepted" ? `${them} is in` : `${them} said not this time`;
    answered(ctx, inv, body);
    if (flipped && !prefersReducedMotion()) view.classList.add("ask-flip");
    if (flipped) heading.focus({ preventScroll: true });
  };
  replace(main, view);
  show(invite, false);
  heading.focus({ preventScroll: true });
  if (invite.status === "waiting") poll(ctx, invite, (inv) => show(inv, true));
}

// Every 3 s while this screen is open and the tab is in view, until the partner answers.
function poll(ctx: VenueCtx, invite: Invite, onAnswer: (inv: Invite) => void): void {
  const at = ticket();
  const tick = async (): Promise<void> => {
    if (!isCurrent(at)) return;
    if (document.visibilityState === "visible") {
      try {
        const now = (await api.invites(ctx.id, ctx.token)).find((i) => i.id === invite.id);
        if (!isCurrent(at)) return;
        if (now && now.status !== "waiting") {
          onAnswer(now);
          return;
        }
      } catch {
        // A missed check is tried again on the next tick.
      }
    }
    window.setTimeout(() => void tick(), POLL_MS);
  };
  window.setTimeout(() => void tick(), POLL_MS);
}
