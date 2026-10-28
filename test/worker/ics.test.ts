import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldLine } from "../../src/worker/actions/ics.ts";
import { localToUtc, nightWindow } from "../../src/worker/zones.ts";

const enc = new TextEncoder();

describe("ics text", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("folds lines over 75 octets with CRLF and one space", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });

  it("never splits a multi byte character", () => {
    const line = `SUMMARY:${"é".repeat(60)}${"漢".repeat(20)}`;
    const parts = foldLine(line).split("\r\n");
    for (const p of parts) {
      expect(enc.encode(p).length).toBeLessThanOrEqual(75);
      expect(p).not.toContain("�");
    }
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });
});

describe("buildIcs", () => {
  const start = localToUtc("2026-11-05", "19:00", "Europe/Berlin");
  const end = localToUtc("2026-11-05", "22:00", "Europe/Berlin");
  const ics = buildIcs({
    uid: "n1@fullhouse",
    start,
    end,
    stamp: new Date("2026-10-25T10:00:00Z"),
    summary: "Jazz, records; and more",
    description: "Line one\nLine two",
    location: "Blue Hour Records, 12 Canal Street, Berlin",
    url: "https://x.example/e/jazz-abcdefghijkm-abcde",
    geo: { lat: 52.52, lng: 13.405 },
  });

  it("uses CRLF everywhere and ends with one", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("has the calendar and event envelope with UTC times", () => {
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("DTSTART:20261105T180000Z");
    expect(lines).toContain("DTEND:20261105T210000Z");
    expect(lines).toContain("DTSTAMP:20261025T100000Z");
    expect(lines).toContain("UID:n1@fullhouse");
    expect(lines).toContain("SUMMARY:Jazz\\, records\\; and more");
    expect(lines).toContain("DESCRIPTION:Line one\\nLine two");
    expect(lines).toContain("GEO:52.520000;13.405000");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
  });
});

describe("venue time zones", () => {
  it("converts local times to UTC across a DST change", () => {
    expect(localToUtc("2026-07-02", "19:00", "Europe/Berlin").toISOString()).toBe("2026-07-02T17:00:00.000Z");
    expect(localToUtc("2026-11-05", "19:00", "Europe/Berlin").toISOString()).toBe("2026-11-05T18:00:00.000Z");
    expect(localToUtc("2026-11-05", "19:00", "America/New_York").toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(localToUtc("2026-11-05", "19:00", "Asia/Kolkata").toISOString()).toBe("2026-11-05T13:30:00.000Z");
  });

  it("moves the end to the next day when a night runs past midnight", () => {
    const w = nightWindow({ date: "2026-11-05", start: "22:00", end: "01:00" }, "Europe/London");
    expect(w.start.toISOString()).toBe("2026-11-05T22:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-06T01:00:00.000Z");
  });
});
