import type { ActionKind, ActionResult, Night } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, prefersReducedMotion, replace, safeHref, uid } from "../dom.ts";
import { count, formatName, longDate, todayIn } from "../format.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { fitHeadlines, flyer } from "../ui/flyer.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, limitsLine } from "../ui/states.ts";
import { refreshState, withVenue, type VenueCtx } from "../venue-context.ts";

const ORDER: ActionKind[] = ["event_page", "poster", "ics", "gcal", "eventbrite", "outreach", "owner_email"];
const PUBLIC: ActionKind[] = ["event_page", "poster", "ics", "gcal", "eventbrite"];

export function publishedPage(id: string, nightId: string): Promise<void> {
  return withVenue(
    id,
    "nights",
    (ctx, main) => {
      const night = ctx.state.nights.find((n) => n.id === nightId) ?? sessionGet<Night>(`night.${nightId}`);
      if (!night) {
        title("Night not found");
        replace(
          main,
          h(
            "div",
            { class: "wrap" },
            h("h1", null, "This night is not here"),
            h("p", null, "It may have been deleted, or the link is incomplete."),
            h("p", null, h("a", { class: "button", href: `/v/${encodeURIComponent(id)}` }, "Back to your nights")),
          ),
        );
        focusHeading();
        return;
      }
      renderNight(ctx, main, night);
    },
    { fresh: true },
  );
}

function actionItem(a: ActionResult): HTMLElement {
  const isPublic = PUBLIC.includes(a.kind);
  const href = safeHref(a.url);
  if (!a.ok) {
    return h("li", { class: "result result-failed" }, h("p", { class: "result-label" }, a.label), h("p", { class: "result-detail" }, `Did not work. ${a.detail}`));
  }
  return h(
    "li",
    { class: "result" },
    href ? h("a", { class: isPublic ? "result-label lit-link" : "result-label", href, ...externalAttrs(href) }, a.label) : h("p", { class: "result-label" }, a.label),
    a.detail ? h("p", { class: "result-detail" }, a.detail) : null,
    composeLinks(a),
  );
}

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

function turnout(ctx: VenueCtx, night: Night, main: HTMLElement): HTMLElement {
  const venue = ctx.state.venue;
  const today = todayIn(venue.tz);
  const section = h("section", { class: "block", "aria-labelledby": "turnout-title" }, h("h2", { id: "turnout-title" }, "Turnout"));
  if (night.date > today) {
    section.append(h("p", null, `After the night, come back here and log how many people came. It opens on ${longDate(night.date)}.`));
    return section;
  }
  if (night.headcount !== undefined) {
    section.append(h("p", { class: "big-line" }, `${count(night.headcount, "person", "people")} came.`));
    if (night.resultNote) section.append(h("p", { class: "quote" }, night.resultNote));
  }
  const head = h("input", { type: "number", id: uid("hc"), min: "0", max: "5000", inputmode: "numeric", required: true, value: night.headcount !== undefined ? String(night.headcount) : null });
  const note = h("textarea", { id: uid("note"), rows: "2", maxlength: "500" });
  if (night.resultNote) note.value = night.resultNote;
  const slot = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form", novalidate: true },
    h("div", { class: "field" }, h("label", { for: head.id }, "How many people came"), head),
    h("div", { class: "field" }, h("label", { for: note.id }, "Anything to remember"), h("p", { class: "hint", id: `${note.id}-hint` }, "Optional. Stays with your venue and is never sent to Qloo."), note),
    h("p", { class: "actions" }, h("button", { class: "button", type: "submit" }, night.headcount !== undefined ? "Update the turnout" : "Save the turnout")),
    slot,
  );
  note.setAttribute("aria-describedby", `${note.id}-hint`);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const n = Number(head.value);
    if (head.value === "" || !Number.isInteger(n) || n < 0) {
      replace(slot, h("p", { class: "form-error", role: "alert" }, "Type the number of people as a whole number."));
      head.focus();
      return;
    }
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    try {
      await api.result(ctx.id, ctx.token, night.id, n, note.value.trim() || undefined);
      const state = await refreshState(ctx).catch(() => null);
      const updated = state?.nights.find((x) => x.id === night.id) ?? { ...night, headcount: n, resultNote: note.value.trim() || undefined };
      renderNight(ctx, main, updated, "Turnout saved.");
    } catch (err) {
      if (button) button.disabled = false;
      replace(slot, failure(err, () => form.requestSubmit()));
    }
  });
  section.append(form);
  return section;
}

function renderNight(ctx: VenueCtx, main: HTMLElement, night: Night, notice?: string): void {
  const venue = ctx.state.venue;
  const justTaped = sessionGet<boolean>(`taped.${night.id}`) === true;
  if (justTaped) sessionSet(`taped.${night.id}`, false);
  title(night.copy?.eventTitle || formatName(night.format));
  const actions = [...night.actions].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const past = night.date < todayIn(venue.tz);
  const published = night.status === "approved" || night.status === "done";
  const live = published && !past;
  const publicActions = actions.filter((a) => PUBLIC.includes(a.kind));
  const privateActions = actions.filter((a) => !PUBLIC.includes(a.kind));
  const windowCol = h(
    "div",
    { class: "night-window" },
    flyer(night, venue, { live, taped: published, justTaped: justTaped && !prefersReducedMotion(), headingLevel: "h2" }),
  );
  const side = h(
    "div",
    { class: "night-side" },
    notice ? h("p", { class: "notice", role: "status" }, notice) : null,
    h(
      "section",
      { class: "block", "aria-labelledby": "rsvp-title" },
      h("h2", { id: "rsvp-title" }, "RSVPs"),
      h(
        "p",
        { class: "rsvp-line" },
        h("span", { class: live ? "lit-text big-number" : "big-number" }, String(night.rsvps)),
        ` ${night.rsvps === 1 ? "person has" : "people have"} said they are coming.`,
      ),
      h("p", { class: "meta" }, "The event page keeps only a count. No names, no emails."),
    ),
    h(
      "section",
      { class: "block", "aria-labelledby": "live-title" },
      h("h2", { id: "live-title" }, past ? "Still online" : "Out on the street"),
      publicActions.length ? h("ul", { class: "results" }, publicActions.map(actionItem)) : h("p", null, "Nothing public was made for this night."),
    ),
    privateActions.length
      ? h(
          "section",
          { class: "block", "aria-labelledby": "yours-title" },
          h("h2", { id: "yours-title" }, "For you to send"),
          h("ul", { class: "results" }, privateActions.map(actionItem)),
        )
      : null,
    turnout(ctx, night, main),
    limitsLine(night.limits),
  );
  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide" },
      h("h1", { class: "page-title" }, justTaped ? "Published" : `${formatName(night.format)}, ${longDate(night.date)}`),
      justTaped ? h("p", { class: "lede" }, "The night is out. Here is everything that went live.") : null,
      h("div", { class: "split split-night" }, windowCol, side),
    ),
  );
  fitHeadlines(main);
  focusHeading();
}
