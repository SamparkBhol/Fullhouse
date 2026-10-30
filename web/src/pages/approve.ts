import type { ActionKind, ApproveInput, EditableCopy, Invite, NightPlan, QuietSlot, Venue } from "../../../src/shared/contract.ts";
import { lowerFirst, shortName } from "../../../src/shared/words.ts";
import { api, type Health } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { longDate, nightKind } from "../format.ts";
import { planMatch } from "../joint.ts";
import { navigate } from "../router.ts";
import { sessionSet } from "../store.ts";
import { evening } from "../ui/evening.ts";
import { pairCard } from "../ui/pair.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { screenHead } from "../first-run/crowd-screen.ts";
import { firstPath, rememberInvite } from "../first-run/run.ts";
import { failure, loading } from "../ui/states.ts";
import { weekStrip } from "../ui/week.ts";
import { LICENCE_NOTE } from "../ui/plan-parts.ts";
import { planGroup, refreshState, rememberPlanResponse, withVenue, type VenueCtx } from "../venue-context.ts";
import { editedCopy, wordsFieldset } from "../ui/words-form.ts";

interface ActionInfo {
  kind: ActionKind;
  title: string;
  does: (venue: Venue, plan: NightPlan) => string;
  ready: (venue: Venue, health: Health) => boolean;
  checked: (venue: Venue) => boolean;
}

const ACTIONS: ActionInfo[] = [
  {
    kind: "event_page",
    title: "Publish the event page",
    does: (v, p) => `Puts a public page for this night online with the date, the times, ${p.pair ? "both places and their addresses" : `${shortName(v.entity.name)} and its address`}, and an RSVP button that only counts. Search engines are asked not to list it.`,
    ready: () => true,
    checked: () => true,
  },
  { kind: "poster", title: "Make the poster", does: () => "Makes a printable A4 poster with a QR code to the page.", ready: () => true, checked: () => true },
  { kind: "ics", title: "Make a calendar file", does: () => "Makes a calendar file that anyone can add to their phone from the event page.", ready: () => true, checked: () => true },
  { kind: "gcal", title: "Make a Google Calendar link", does: () => "Makes a link that adds the night to a Google Calendar.", ready: () => true, checked: () => true },
  {
    kind: "outreach",
    title: "Draft notes to the partners",
    does: (_v, p) => (p.partners.length ? `Opens a ready written note to ${p.partners.length === 1 ? "the partner" : `each of the ${p.partners.length} partners`} in your own mail app. Nothing is sent until you press send there.` : "This plan has no partners, so there is nothing to draft."),
    ready: () => true,
    checked: (v) => !v.contact,
  },
  {
    kind: "eventbrite",
    title: "Create the Eventbrite event",
    does: (v) => `Creates the event on ${v.eventbrite ? v.eventbrite.organization : "your Eventbrite account"} and publishes it. Eventbrite lists it in its public search with your address.`,
    ready: (v) => Boolean(v.eventbrite),
    checked: () => false,
  },
  {
    kind: "owner_email",
    title: "Email me the links",
    does: (v) => (v.ownerEmail ? `Sends the links to ${v.ownerEmail}. Only you get it.` : "Sends the links to your email."),
    ready: (v, health) => health.ownerEmail && Boolean(v.ownerEmail),
    checked: (v) => !!v.ownerEmail,
  },
];

export function approvePage(id: string, planId: string): Promise<void> {
  return withVenue(id, "nights", async (ctx, main) => {
    const { plan } = planGroup(ctx.state, planId);
    if (!plan) {
      navigate(`/v/${encodeURIComponent(id)}/night/${encodeURIComponent(planId)}`, { replace: true });
      return;
    }
    const [health, invites] = await Promise.all([api.health(), api.invites(ctx.id, ctx.token).catch(() => [] as Invite[])]);
    renderApprove(ctx, main, plan, health, invites.find((i) => i.planId === planId && i.status === "accepted") ?? null);
  });
}

// What the partner said yes to, in the partner's own words, beside the pair.
function partnerSaid(plan: NightPlan, accepted: Invite | null): HTMLElement | null {
  const m = planMatch(plan);
  if (!m || !plan.pair) return null;
  const them = shortName(m.partner.name);
  const c = accepted?.confirmed;
  const stop = plan.pair.stops.find((s) => s.at === "partner");
  const id = uid("said");
  const body = c && (c.start || c.what)
    ? [h("p", null, `${them} said yes through its invite link and ${c.kept ? "accepted the proposed" : "set its part itself,"} ${lowerFirst(stop?.what ?? c.what ?? "")} from ${stop?.start ?? c.start}.`), c.tellsRegulars ? h("p", null, `${them} tells its regulars too.`) : h("p", null, `${them} did not tick that it tells its regulars, so the page does not say it does.`), c.contact ? h("p", { class: "contact" }, `Reach ${them} at ${c.contact}. Only you see this.`) : null]
    : accepted
      ? [h("p", null, `${them} said yes through its invite link without setting its part, so its stop goes up as proposed, subject to its programme, and stays off the poster.`)]
      : [h("p", null, `${them} has not said yes yet. The night cannot go up with its name until it does.`)];
  return h("section", { class: "panel", "aria-labelledby": id }, h("h2", { id }, `What ${them} agreed to`), ...body);
}

const STARTS = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];

// Changing the day or the start makes a new plan. A partner that already said yes gets a fresh invite for it.
function whenPanel(ctx: VenueCtx, plan: NightPlan, accepted: Invite | null): HTMLElement {
  const venue = ctx.state.venue;
  const status = h("div", { "aria-live": "polite" });
  const start = h("select", { "aria-label": "Start time" }, [...new Set([...STARTS, plan.start])].sort().map((t) => h("option", { value: t, selected: t === plan.start }, t))) as HTMLSelectElement;
  const replan = async (weekday: QuietSlot["weekday"], startAt: string): Promise<void> => {
    replace(status, loading(accepted ? "Planning again, then asking your partner again" : "Planning again"));
    try {
      const r = await api.plan(ctx.id, ctx.token, { weekday, start: startAt });
      rememberPlanResponse(r);
      await refreshState(ctx).catch(() => undefined);
      const m = planMatch(r.plan);
      if (accepted && m) {
        const invite = await api.invite(ctx.id, ctx.token, r.plan.id, m.partner.id);
        rememberInvite(ctx.id, invite);
        sessionSet(`first.${ctx.id}.plan`, r.plan.id);
        navigate(firstPath(ctx.id, "ask"));
        return;
      }
      navigate(`/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(r.plan.id)}/approve`, { replace: true });
    } catch (err) {
      replace(status, failure(err));
    }
  };
  const week = weekStrip(plan, venue, (weekday) => void replan(weekday, start.value));
  start.addEventListener("change", () => void replan(new Date(`${plan.date}T12:00:00Z`).getUTCDay() as QuietSlot["weekday"], start.value));
  const id = uid("when");
  return h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("h2", { id }, `${longDate(plan.date)}, ${plan.start} to ${plan.end}`),
    h("p", null, accepted ? `Change the day or the start and Full House plans again and sends ${shortName(accepted.partner.name)} a new invite, because the yes was for this time.` : "Change the day or the start and Full House plans the night again around it."),
    week,
    h("label", { class: "field-row" }, h("span", { class: "label" }, "Starts at"), start),
    status,
  );
}

function licenceLines(plan: NightPlan): HTMLElement | null {
  const lines = plan.limits.filter((l) => /licen[cs]e|public performance/i.test(l));
  if (plan.playlist.length && !lines.length) lines.push(LICENCE_NOTE);
  if (!lines.length) return null;
  return h("ul", { class: "night-notes licence-lines", "aria-label": "Before it goes out" }, lines.map((l) => h("li", null, l)));
}

function renderApprove(ctx: VenueCtx, main: HTMLElement, plan: NightPlan, health: Health, accepted: Invite | null): void {
  const venue = ctx.state.venue;
  title("Review and publish");
  const boxes = new Map<ActionKind, HTMLInputElement>();
  const emailInputs = new Map<string, HTMLInputElement>();
  const copyInputs = new Map<keyof EditableCopy, HTMLInputElement | HTMLTextAreaElement>();
  const m = planMatch(plan);
  const offered = ACTIONS.filter((a) => a.ready(venue, health) && !(a.kind === "outreach" && !plan.partners.length));
  const rows = offered.map((a) => {
    const id = uid("act");
    const box = h("input", { type: "checkbox", id, checked: a.checked(venue) });
    boxes.set(a.kind, box);
    const extra: HTMLElement[] = [];
    if (a.kind === "outreach") {
      const fields = plan.partners.map((p) => {
        const input = h("input", { type: "email", id: uid("pe"), autocomplete: "off", inputmode: "email" });
        emailInputs.set(p.id, input);
        return h("div", { class: "field-row" }, h("label", { for: input.id }, `Email for ${shortName(p.name)}`), input);
      });
      extra.push(h("div", { class: "partner-emails" }, h("p", { class: "hint" }, "Optional. If you know their address, add it and the draft is addressed for you. Leave it blank to fill it in your mail app."), fields));
    }
    return h("li", { class: "action check-row" }, box, h("label", { for: id }, h("strong", null, a.title), h("span", null, a.does(venue, plan))), extra.length ? h("div", { class: "sub" }, extra) : null);
  });

  const message = h("div", { "aria-live": "polite" });
  const confirmed = Boolean(accepted?.confirmed && (accepted.confirmed.start || accepted.confirmed.what));
  const form = h(
    "form",
    { class: "form", novalidate: true },
    h("section", { class: "panel", "aria-labelledby": "evening-title" }, h("h2", { id: "evening-title" }, "The evening as it goes out"), evening(plan, venue, { partnerProposed: Boolean(plan.pair) && !confirmed })),
    wordsFieldset(plan, copyInputs),
    h("fieldset", { class: "panel actions-list" }, h("legend", { class: "panel-legend" }, "What Full House will do"), h("ul", { class: "rows" }, rows)),
    licenceLines(plan),
    h(
      "p",
      { class: "actions" },
      h("button", { class: "btn", type: "submit" }, "Publish the night"),
      h("a", { class: "btn btn-quiet", href: `/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(plan.id)}` }, "Back to the plan"),
    ),
    message,
  );

  const side = h(
    "div",
    { class: "stack" },
    m
      ? pairCard({
          you: { name: venue.entity.name, ...(venue.entity.image ? { image: venue.entity.image } : {}) },
          them: { name: m.partner.name, ...(m.partner.image ? { image: m.partner.image } : {}) },
          walkMin: m.partner.walkMin ?? null,
          size: "small",
        })
      : null,
    partnerSaid(plan, accepted),
    whenPanel(ctx, plan, accepted),
  );

  replace(
    main,
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "wrap" },
        screenHead("Review and publish", `${nightKind(plan)}, ${longDate(plan.date)}. Nothing leaves Full House until you press Publish the night. Read the words, untick anything you do not want, and change what you like.`),
        h("div", { class: "screen-grid" }, form, side),
      ),
    ),
  );
  focusHeading();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const actions = offered.filter((a) => boxes.get(a.kind)?.checked).map((a) => a.kind);
    if (!actions.length) {
      replace(message, h("p", { class: "form-error", role: "alert" }, "Tick at least one thing to do, or go back to the plan."));
      return;
    }
    const partnerEmails: Record<string, string> = {};
    const bad: string[] = [];
    for (const [pid, input] of emailInputs) {
      const v = input.value.trim();
      if (!v) continue;
      if (!input.checkValidity()) bad.push(shortName(plan.partners.find((p) => p.id === pid)?.name ?? "a partner"));
      else partnerEmails[pid] = v;
    }
    if (bad.length) {
      replace(message, h("p", { class: "form-error", role: "alert" }, `The email for ${bad.join(" and ")} does not look complete.`));
      return;
    }
    const input: ApproveInput = actions.includes("outreach") && Object.keys(partnerEmails).length ? { actions, partnerEmails } : { actions };
    const copy = editedCopy(plan, copyInputs);
    if (copy) input.copy = copy;
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    replace(message, loading("Publishing the night", offered.filter((a) => actions.includes(a.kind)).map((a) => a.title)));
    try {
      const night = await api.approve(ctx.id, ctx.token, plan.id, input);
      sessionSet(`justout.${night.id}`, true);
      sessionSet(`night.${night.id}`, night);
      await refreshState(ctx).catch(() => undefined);
      navigate(`/v/${encodeURIComponent(ctx.id)}/nights/${encodeURIComponent(night.id)}`, { replace: true });
    } catch (err) {
      if (button) button.disabled = false;
      replace(message, failure(err, () => form.requestSubmit()));
    }
  });
}
