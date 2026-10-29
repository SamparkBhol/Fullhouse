import type { ActionKind, ActionResult, NightPlan, PlanInput, Venue } from "../../shared/contract.ts";
import { esc } from "../pages/html.ts";
import { shortName } from "../../shared/words.ts";
import { eventUrl, placeLine } from "../pages/event.ts";
import { guestSource } from "../pages/guest.ts";
import { makeSlug } from "../slug.ts";
import { describeDate } from "../../core/index.ts";
import { eventbriteUtc, nightWindow } from "../zones.ts";
import { sendOwnerEmail } from "./email.ts";
import { createEventbriteEvent, currencyForZone, type EventbriteDraft } from "./eventbrite.ts";
import { gcalUrl, gmailUrl, isEmail, mailtoUrl, outlookUrl, outreachBody } from "./links.ts";

export const ACTION_ORDER: ActionKind[] = ["event_page", "poster", "ics", "gcal", "outreach", "eventbrite", "owner_email"];

export interface Published {
  page: boolean;
  poster: boolean;
  ics: boolean;
}

export interface ActionContext {
  night: NightPlan;
  venue: Venue;
  input: PlanInput;
  actions: ActionKind[];
  partnerEmails: Record<string, string>;
  origin: string;
  now: Date;
  fetch: typeof fetch;
  eventbrite: { token: string; organizationId: string } | null;
  resend: { key: string; from: string } | null;
  ownerLink: string;
  mailCapped?: boolean;
  slugRand?: () => string;
}

export interface ActionRun {
  results: ActionResult[];
  slug?: string;
  published: Published;
}

const DEFAULT_TICKETS = 50;

function whenLine(night: NightPlan): string {
  return `${describeDate(night.date)}, ${night.start} to ${night.end}`;
}

function eventbriteHtml(night: NightPlan, venueName: string, url: string | undefined): string {
  const paras = night.copy.eventDescription
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
  return (
    paras +
    `<p>${esc(guestSource(venueName))}. Qloo's taste data is a pattern across many people, not a fact about any one person.</p>` +
    (url ? `<p>More details: <a href="${esc(url)}">${esc(url)}</a></p>` : "")
  );
}

function ownerMail(ctx: ActionContext, results: ActionResult[]): { subject: string; text: string; html: string } {
  const lines = results.filter((r) => r.ok && r.url && r.kind !== "outreach").map((r) => `${r.label}: ${r.url}`);
  const drafts = results.filter((r) => r.kind === "outreach" && r.ok).length;
  const text = [
    `${ctx.night.copy.eventTitle} is set for ${whenLine(ctx.night)} at ${ctx.venue.entity.name}.`,
    "",
    ...lines,
    drafts ? `\n${drafts} partner email drafts are waiting on your venue page. Full House has not sent them.` : "",
    "",
    `Your venue page: ${ctx.ownerLink}`,
    "Keep this link to yourself. Anyone who has it can manage your venue.",
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");
  const html =
    `<p>${esc(ctx.night.copy.eventTitle)} is set for ${esc(whenLine(ctx.night))} at ${esc(ctx.venue.entity.name)}.</p>` +
    (lines.length
      ? `<ul>${results
          .filter((r) => r.ok && r.url && r.kind !== "outreach")
          .map((r) => `<li><a href="${esc(r.url ?? "")}">${esc(r.label)}</a></li>`)
          .join("")}</ul>`
      : "") +
    (drafts ? `<p>${drafts} partner email drafts are waiting on your venue page. Full House has not sent them.</p>` : "") +
    `<p><a href="${esc(ctx.ownerLink)}">Open your venue page</a>. Keep this link to yourself. Anyone who has it can manage your venue.</p>`;
  return { subject: `Your night is set: ${ctx.night.copy.eventTitle}`, text, html };
}

export async function runActions(ctx: ActionContext): Promise<ActionRun> {
  const chosen = new Set(ctx.actions);
  const results: ActionResult[] = [];
  const published: Published = {
    page: chosen.has("event_page"),
    poster: chosen.has("poster"),
    ics: chosen.has("ics") || chosen.has("event_page"),
  };
  const needsSlug = published.page || published.poster || published.ics;
  const slug = needsSlug ? makeSlug(ctx.night.copy.eventTitle, ctx.venue.id, ctx.slugRand?.()) : undefined;
  const pageUrl = slug ? eventUrl(ctx.origin, slug) : undefined;
  const publicPageUrl = published.page ? pageUrl : undefined;

  let window: { start: Date; end: Date } | null = null;
  try {
    window = nightWindow(ctx.night, ctx.venue.tz);
  } catch {
    window = null;
  }
  const location = placeLine({ venueName: ctx.venue.entity.name, address: ctx.venue.entity.address, city: ctx.venue.city });

  for (const kind of ACTION_ORDER) {
    if (!chosen.has(kind)) continue;
    switch (kind) {
      case "event_page":
        results.push({
          kind,
          ok: true,
          url: pageUrl,
          label: "Public event page",
          detail: "Live now. Anyone with the link can see it and say they are coming. Search engines are asked not to list it.",
        });
        break;
      case "poster":
        results.push({ kind, ok: true, url: `${pageUrl}/poster`, label: "Printable poster", detail: "A4 portrait with a QR code that opens the event page." });
        break;
      case "ics":
        results.push({ kind, ok: true, url: `${pageUrl}.ics`, label: "Calendar file (.ics)", detail: "Works with Apple Calendar, Outlook and most other calendars." });
        break;
      case "gcal":
        if (!window) {
          results.push({ kind, ok: false, label: "Google Calendar link", detail: "The night has no valid date and time, so no calendar link was made." });
          break;
        }
        results.push({
          kind,
          ok: true,
          url: gcalUrl({
            title: ctx.night.copy.eventTitle,
            details: `${ctx.night.copy.eventDescription}${publicPageUrl ? `\n\n${publicPageUrl}` : ""}`,
            location,
            start: window.start,
            end: window.end,
          }),
          label: "Add to Google Calendar",
          detail: "Opens Google Calendar with the night filled in. You press save.",
        });
        break;
      case "outreach": {
        if (!ctx.night.partners.length) {
          results.push({ kind, ok: false, label: "Partner drafts", detail: "This plan has no partner places, so there is nothing to draft." });
          break;
        }
        for (const partner of ctx.night.partners) {
          const raw = ctx.partnerEmails[partner.id];
          const to = isEmail(raw) ? raw : undefined;
          const draft = {
            to,
            subject: ctx.night.copy.partnerPitch.subject,
            body: outreachBody(ctx.night.copy.partnerPitch.body, publicPageUrl),
          };
          results.push({
            kind,
            ok: true,
            url: mailtoUrl(draft),
            label: `Draft to ${shortName(partner.name)}`,
            detail: to
              ? `Addressed to ${to}. It opens in your own mail app and nothing is sent until you press send there.`
              : "No address yet. Add theirs in your mail app. Nothing is sent until you press send there.",
            links: [
              { label: "Mail app", url: mailtoUrl(draft) },
              { label: "Gmail", url: gmailUrl(draft) },
              { label: "Outlook", url: outlookUrl(draft) },
            ],
          });
        }
        break;
      }
      case "eventbrite": {
        if (!ctx.eventbrite) {
          results.push({ kind, ok: false, label: "Eventbrite event", detail: "Eventbrite is not connected. Connect it on your venue page, then approve again." });
          break;
        }
        if (!window) {
          results.push({ kind, ok: false, label: "Eventbrite event", detail: "The night has no valid date and time, so nothing was created." });
          break;
        }
        const capacity = ctx.input.maxPeople ?? ctx.venue.capacity;
        const draft: EventbriteDraft = {
          organizationId: ctx.eventbrite.organizationId,
          name: ctx.night.copy.eventTitle,
          summary: (ctx.night.copy.posterSub || ctx.night.copy.eventDescription).replace(/\s+/g, " ").slice(0, 140),
          descriptionHtml: eventbriteHtml(ctx.night, ctx.venue.entity.name, publicPageUrl),
          timezone: ctx.venue.tz,
          startUtc: eventbriteUtc(window.start),
          endUtc: eventbriteUtc(window.end),
          currency: currencyForZone(ctx.venue.tz),
          capacity: capacity ?? DEFAULT_TICKETS,
          venue: {
            name: ctx.venue.entity.name,
            address: ctx.venue.entity.address,
            city: ctx.venue.city,
            lat: ctx.venue.entity.lat,
            lng: ctx.venue.entity.lng,
          },
        };
        const out = await createEventbriteEvent(ctx.eventbrite.token, draft, ctx.fetch);
        if (out.ok) {
          const notes = [
            out.venueAttached ? "Published on your Eventbrite organization with free tickets." : "Published with free tickets. Eventbrite would not take the venue record, so the address is in the description.",
            capacity ? "" : `No capacity was set, so it has ${DEFAULT_TICKETS} tickets. Change that on Eventbrite if needed.`,
          ].filter(Boolean);
          results.push({ kind, ok: true, url: out.url, label: "Eventbrite event", detail: notes.join(" ") });
        } else {
          results.push({ kind, ok: false, label: "Eventbrite event", detail: out.reason });
        }
        break;
      }
      case "owner_email": {
        if (!ctx.venue.ownerEmail) {
          results.push({ kind, ok: false, label: "Email to you", detail: "There is no owner email on file, so nothing was sent." });
          break;
        }
        if (!ctx.resend) {
          results.push({ kind, ok: false, label: "Email to you", detail: "Email is off on this server, so nothing was sent." });
          break;
        }
        if (ctx.mailCapped) {
          results.push({ kind, ok: false, label: "Email to you", detail: "Full House already sent this venue three emails today, so this one was held back." });
          break;
        }
        const sent = await sendOwnerEmail(ctx.resend, ctx.venue.ownerEmail, ownerMail(ctx, results), ctx.fetch);
        results.push(
          sent.ok
            ? { kind, ok: true, label: "Email to you", detail: `Sent to ${ctx.venue.ownerEmail} with every link above.` }
            : { kind, ok: false, label: "Email to you", detail: sent.reason },
        );
        break;
      }
    }
  }
  return slug ? { results, slug, published } : { results, published };
}
