import type { ActionKind, ApproveInput, EditableCopy, NightPlan, Venue } from "../../../src/shared/contract.ts";
import { api, type Health } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { formatName, longDate } from "../format.ts";
import { navigate } from "../router.ts";
import { sessionSet } from "../store.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { planGroup, refreshState, withVenue, type VenueCtx } from "../venue-context.ts";

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
    does: (v) =>
      `Puts a public page for this night online with the date, time, ${v.entity.name}, its address and an RSVP button that only counts. Search engines are asked not to list it.`,
    ready: () => true,
    checked: () => true,
  },
  {
    kind: "poster",
    title: "Make the poster",
    does: () => "Makes a printable A4 poster of this flyer for your window.",
    ready: () => true,
    checked: () => true,
  },
  {
    kind: "ics",
    title: "Make a calendar file",
    does: () => "Makes a calendar file that anyone can add to their phone from the event page.",
    ready: () => true,
    checked: () => true,
  },
  {
    kind: "gcal",
    title: "Make a Google Calendar link",
    does: () => "Makes a link that adds the night to a Google Calendar.",
    ready: () => true,
    checked: () => true,
  },
  {
    kind: "outreach",
    title: "Draft notes to the partners",
    does: (_v, p) =>
      p.partners.length
        ? `Opens a ready written note to ${p.partners.length === 1 ? "the partner" : `each of the ${p.partners.length} partners`} in your own mail app. Nothing is sent until you press send there.`
        : "This plan has no partners, so there is nothing to draft.",
    ready: () => true,
    checked: () => true,
  },
  {
    kind: "eventbrite",
    title: "Create the Eventbrite event",
    does: (v) =>
      `Creates the event on ${v.eventbrite ? v.eventbrite.organization : "your Eventbrite account"} and publishes it. Eventbrite lists it in its public search with your address.`,
    ready: (v) => Boolean(v.eventbrite),
    // Eventbrite puts the night in its public search, so it is never ticked for the owner.
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
    renderApprove(ctx, main, plan, await api.health());
  });
}

const EDITS: Array<{ key: keyof EditableCopy; label: string; long?: boolean }> = [
  { key: "eventTitle", label: "Title" },
  { key: "eventDescription", label: "Description", long: true },
  { key: "posterHeadline", label: "Poster headline" },
  { key: "posterSub", label: "Poster line" },
];

// The owner approves the exact words that go out, and can change them here.
function wordsFieldset(plan: NightPlan, inputs: Map<keyof EditableCopy, HTMLInputElement | HTMLTextAreaElement>): HTMLElement {
  const fields = EDITS.map((e) => {
    const input = e.long ? h("textarea", { id: uid("copy"), rows: "5", maxlength: "1200" }) : h("input", { type: "text", id: uid("copy"), maxlength: "80" });
    input.value = plan.copy[e.key];
    inputs.set(e.key, input);
    return h("div", { class: "field" }, h("label", { for: input.id }, e.label), input);
  });
  return h(
    "fieldset",
    { class: "actions-list" },
    h("legend", null, "The words that go out"),
    h("p", { class: "hint" }, "This is what guests read on the page and the poster. Change anything. Dashes and a few overused words are not allowed."),
    fields,
    h("details", { class: "pitch" }, h("summary", null, "The note to partners"), h("p", { class: "quote" }, h("strong", null, plan.copy.partnerPitch.subject)), h("p", { class: "quote pre" }, plan.copy.partnerPitch.body)),
  );
}

function editedCopy(plan: NightPlan, inputs: Map<keyof EditableCopy, HTMLInputElement | HTMLTextAreaElement>): EditableCopy | undefined {
  const out: EditableCopy = {};
  for (const [key, input] of inputs) if (input.value.trim() !== plan.copy[key]) out[key] = input.value.trim();
  return Object.keys(out).length ? out : undefined;
}

function renderApprove(ctx: VenueCtx, main: HTMLElement, plan: NightPlan, health: Health): void {
  const venue = ctx.state.venue;
  title("Publish this night");
  const boxes = new Map<ActionKind, HTMLInputElement>();
  const emailInputs = new Map<string, HTMLInputElement>();
  const copyInputs = new Map<keyof EditableCopy, HTMLInputElement | HTMLTextAreaElement>();

  // Only what will happen is listed: an action this venue or server cannot run gets no row at all.
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
        return h("div", { class: "field" }, h("label", { for: input.id }, `Email for ${p.name}`), input);
      });
      extra.push(
        h(
          "div",
          { class: "partner-emails" },
          h("p", { class: "hint" }, "Optional. If you know their address, add it and the draft is addressed for you. Leave it blank to fill it in your mail app."),
          fields,
        ),
      );
    }
    return h(
      "li",
      { class: "action" },
      h("div", { class: "check" }, box, h("label", { for: id }, h("strong", null, a.title), h("span", null, a.does(venue, plan)))),
      extra,
    );
  });

  const message = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form", novalidate: true },
    wordsFieldset(plan, copyInputs),
    h("fieldset", { class: "actions-list" }, h("legend", null, "What Full House will do"), h("ul", null, rows)),
    h(
      "p",
      { class: "actions" },
      h("button", { class: "button button-big button-lamp", type: "submit" }, "Publish the night"),
      h("a", { class: "button button-quiet", href: `/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(plan.id)}` }, "Back to the plan"),
    ),
    message,
  );

  replace(
    main,
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "Publish this night"),
      h("p", { class: "lede" }, `${formatName(plan.format, plan.feature?.type)}, ${longDate(plan.date)}, ${plan.start} to ${plan.end}.`),
      h("p", null, "Nothing leaves Full House until you press Publish the night. This is everything it will do. Untick anything you do not want."),
      form,
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
      if (!input.checkValidity()) bad.push(plan.partners.find((p) => p.id === pid)?.name ?? "a partner");
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
      sessionSet(`taped.${night.id}`, true);
      sessionSet(`night.${night.id}`, night);
      await refreshState(ctx).catch(() => undefined);
      navigate(`/v/${encodeURIComponent(ctx.id)}/nights/${encodeURIComponent(night.id)}`, { replace: true });
    } catch (err) {
      if (button) button.disabled = false;
      replace(message, failure(err, () => form.requestSubmit()));
    }
  });
}
