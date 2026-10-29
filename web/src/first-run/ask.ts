import type { NightPlan } from "../../../src/shared/contract.ts";
import { shortName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, prefersReducedMotion, replace, uid } from "../dom.ts";
import { displayTitle, longDate, nightKind, walkMinutes } from "../format.ts";
import { planMatch, type Invite } from "../joint.ts";
import { isCurrent, ticket } from "../router.ts";
import { evening } from "../ui/evening.ts";
import { pairCard } from "../ui/pair.ts";
import { credit } from "../ui/shell.ts";
import { refreshState, type VenueCtx } from "../venue-context.ts";
import { screenHead } from "./crowd-screen.ts";
import { firstPath, ownerLink, rememberInvite } from "./run.ts";
import { copyButton, inviteNote, mailHref, sendInvite } from "./share.ts";

const POLL_MS = 3000;

export function nightTitle(plan: NightPlan): string {
  const kind = nightKind(plan);
  return plan.feature ? `${kind} for ${displayTitle(plan.feature.name)}, ${longDate(plan.date)} at ${plan.start}` : `${kind}, ${longDate(plan.date)} at ${plan.start}`;
}

function ownerNote(ctx: VenueCtx): HTMLElement {
  const url = ownerLink(ctx);
  const field = h("input", { type: "text", readonly: true, value: url, id: uid("owner") });
  const copy = copyButton("Copy your owner link", () => url, field);
  return h(
    "details",
    { class: "disclose more" },
    h("summary", null, "Open your venue on another phone"),
    h("p", { class: "meta" }, "This phone stays signed in. Your owner link opens the venue anywhere else. Anyone who has it can publish nights for you, so keep it to yourself."),
    h("label", { for: field.id, class: "sr-only" }, "Owner link"),
    h("p", { class: "actions-tight actions" }, field),
    h("p", { class: "actions actions-tight" }, copy.button),
    copy.status,
  );
}

function waitingPanel(ctx: VenueCtx, invite: Invite, plan: NightPlan | null): HTMLElement {
  const note = inviteNote(invite, ctx.state.venue.entity.name, plan ? nightTitle(plan) : "a night together");
  const field = h("input", { type: "text", readonly: true, value: invite.url, id: uid("invite") });
  const copy = copyButton("Copy the link", () => invite.url, field);
  const again = h("button", { class: "btn", type: "button" }, "Share the invite");
  again.addEventListener("click", () => void sendInvite(invite, note));
  return h(
    "section",
    { class: "panel", "aria-labelledby": "invite-title" },
    h("h2", { id: "invite-title" }, "The invite"),
    h("p", { class: "pre" }, note.body.replace(invite.url, "").trim()),
    h("p", { class: "actions" }, again, h("a", { class: "btn btn-quiet", href: mailHref(note) }, "Write it as an email")),
    h("div", { class: "field-row" }, h("label", { for: field.id }, "Their invite link"), field),
    h("p", { class: "actions actions-tight" }, copy.button),
    copy.status,
    h("p", { class: "meta live-status" }, h("span", { class: "live-dot", "aria-hidden": "true" }), `This screen checks for ${shortName(invite.partner.name)}'s answer every few seconds and changes on its own.`),
    ownerNote(ctx),
  );
}

// The yes opens the review screen, never the publish button: the owner reads the words, the partner's own stop and
// the licence lines before anything leaves.
function answeredPanel(ctx: VenueCtx, invite: Invite): HTMLElement {
  const them = shortName(invite.partner.name);
  if (invite.status === "declined") {
    return h(
      "section",
      { class: "panel", "aria-label": "Their answer" },
      h("p", null, `${them} said not this time. Nothing went out under either name.`),
      h("p", { class: "actions" }, h("a", { class: "btn", href: firstPath(ctx.id, "match") }, "Pick another place")),
    );
  }
  const c = invite.confirmed;
  const said = c && (c.start || c.what) ? `${them} set its own part: ${c.what ?? "as planned"}${c.start ? ` from ${c.start}` : ""}.${c.tellsRegulars ? " It tells its regulars too." : ""}` : `${them} pressed yes without setting its part, so its stop goes up as proposed, subject to its programme.`;
  return h(
    "section",
    { class: "panel panel-them", "aria-labelledby": "yes-title" },
    h("h2", { id: "yes-title", class: "them-text" }, `${them} said yes`),
    h("p", null, said),
    h("p", null, "Next, one screen shows the evening as it goes out, the exact words, and everything Full House will make. Nothing leaves until you press Publish there."),
    h("p", { class: "actions" }, h("a", { class: "btn", href: `/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(invite.planId)}/approve` }, "Review and publish")),
  );
}

function sidePanel(ctx: VenueCtx, invite: Invite, plan: NightPlan | null): HTMLElement {
  const venue = ctx.state.venue;
  const m = plan ? planMatch(plan) : null;
  const partner = m?.partner;
  return h(
    "div",
    { class: "stack" },
    pairCard({
      you: { name: venue.entity.name, ...(venue.entity.image ? { image: venue.entity.image } : {}) },
      them: { name: invite.partner.name, ...((partner?.image ?? invite.partner.image) ? { image: partner?.image ?? invite.partner.image ?? "" } : {}) },
      walkMin: partner ? walkMinutes(partner.distanceM) : null,
      size: "small",
    }),
    plan ? h("section", { class: "panel", "aria-labelledby": "ask-night" }, h("h2", { id: "ask-night" }, `${nightKind(plan)}, ${longDate(plan.date)}`), evening(plan, venue)) : null,
  );
}

export function askScreen(ctx: VenueCtx, main: HTMLElement, invite: Invite, plan: NightPlan | null): void {
  const them = shortName(invite.partner.name);
  credit("Taste data from Qloo. Plan by Full House.");
  const head = h("div");
  const left = h("div");
  const view = h("div", { class: "screen" }, h("div", { class: "wrap" }, head, h("div", { class: "screen-grid" }, left, sidePanel(ctx, invite, plan))));
  const show = (inv: Invite, flipped: boolean): void => {
    view.dataset.status = inv.status;
    rememberInvite(ctx.id, inv);
    if (inv.status === "waiting") {
      replace(head, screenHead(`Waiting for ${them}`, `The invite is with ${them}. When they press We're in on their page, this screen changes on its own.`));
      replace(left, waitingPanel(ctx, inv, plan));
    } else {
      const yes = inv.status === "accepted";
      replace(head, screenHead(yes ? `${them} is in` : `${them} said not this time`, yes ? `${them} said yes on their invite page. Review the night, then it can go out with both your names on it.` : null));
      replace(left, answeredPanel(ctx, inv));
      if (flipped && !prefersReducedMotion()) left.firstElementChild?.classList.add("flipped");
      if (flipped) void refreshState(ctx).catch(() => undefined);
    }
    head.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  };
  replace(main, view);
  show(invite, false);
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
