import { compactUtc } from "../zones.ts";

export interface CalendarLinkInput {
  title: string;
  details: string;
  location: string;
  start: Date;
  end: Date;
}

export function gcalUrl(ev: CalendarLinkInput): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${compactUtc(ev.start)}/${compactUtc(ev.end)}`,
    details: ev.details,
    location: ev.location,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export const EMAIL_RE = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

export interface Draft {
  to?: string;
  subject: string;
  body: string;
}

// RFC 6068 wants CRLF line breaks and percent encoding in mailto bodies.
export function mailtoUrl(d: Draft): string {
  const params = [`subject=${encodeURIComponent(d.subject)}`, `body=${encodeURIComponent(d.body.replace(/\r?\n/g, "\r\n"))}`];
  const to = d.to && isEmail(d.to) ? encodeURIComponent(d.to).replace(/%40/g, "@") : "";
  return `mailto:${to}?${params.join("&")}`;
}

export function gmailUrl(d: Draft): string {
  const q = new URLSearchParams({ view: "cm", fs: "1" });
  if (d.to && isEmail(d.to)) q.set("to", d.to);
  q.set("su", d.subject);
  q.set("body", d.body);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

export function outlookUrl(d: Draft): string {
  const q = new URLSearchParams();
  if (d.to && isEmail(d.to)) q.set("to", d.to);
  q.set("subject", d.subject);
  q.set("body", d.body);
  return `https://outlook.live.com/mail/0/deeplink/compose?${q.toString()}`;
}

export const AGGREGATE_NOTE =
  "Where this comes from: Qloo's aggregate taste data for people who like our venue. It is a pattern across many people, not a statement about your customers or anyone in particular.";

export function outreachBody(pitchBody: string, eventUrl?: string): string {
  const parts = [pitchBody.trim()];
  if (eventUrl) parts.push(`Event page: ${eventUrl}`);
  if (!pitchBody.includes(AGGREGATE_NOTE)) parts.push(AGGREGATE_NOTE);
  return parts.join("\n\n");
}
