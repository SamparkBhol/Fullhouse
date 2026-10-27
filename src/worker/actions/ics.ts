import { compactUtc } from "../zones.ts";

export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  stamp: Date;
  summary: string;
  description: string;
  location: string;
  url?: string;
  geo?: { lat: number; lng: number };
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const utf8 = new TextEncoder();

// RFC 5545 section 3.1: lines longer than 75 octets continue on the next line after one space,
// and the split must not fall inside a multi byte character.
export function foldLine(line: string): string {
  if (utf8.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = utf8.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(ev: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Full House//Night//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${compactUtc(ev.stamp)}`,
    `DTSTART:${compactUtc(ev.start)}`,
    `DTEND:${compactUtc(ev.end)}`,
    `SUMMARY:${escapeIcsText(ev.summary)}`,
    `DESCRIPTION:${escapeIcsText(ev.description)}`,
    `LOCATION:${escapeIcsText(ev.location)}`,
  ];
  if (ev.url) lines.push(`URL:${ev.url}`);
  if (ev.geo && Number.isFinite(ev.geo.lat) && Number.isFinite(ev.geo.lng)) {
    lines.push(`GEO:${ev.geo.lat.toFixed(6)};${ev.geo.lng.toFixed(6)}`);
  }
  lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
