import { describe, expect, it } from "vitest";
import { describeDate, isValidTimeZone, localParts, nextMondayNine, nextSlotDate, zonedToUtc } from "../../src/core/index.ts";

const thu = { weekday: 4 as const, start: "19:00", durationMin: 180 };

describe("nextSlotDate", () => {
  it("finds the next occurrence in the venue's zone, not UTC", () => {
    expect(nextSlotDate(thu, "America/New_York", new Date("2026-10-25T15:00:00Z"))).toEqual({ date: "2026-10-29", start: "19:00", end: "22:00" });
    expect(nextSlotDate({ ...thu, weekday: 0 }, "Asia/Tokyo", new Date("2026-10-23T02:00:00Z"))).toEqual({ date: "2026-10-25", start: "19:00", end: "22:00" });
    expect(nextSlotDate({ ...thu, weekday: 6 }, "Pacific/Honolulu", new Date("2026-10-25T05:00:00Z")).date).toBe("2026-10-31");
  });

  it("gives at least two days' notice, so a night never lands the same evening", () => {
    expect(nextSlotDate(thu, "Europe/London", new Date("2026-10-27T18:59:00Z")).date).toBe("2026-10-29");
    expect(nextSlotDate(thu, "Europe/London", new Date("2026-10-27T19:01:00Z")).date).toBe("2026-11-05");
    expect(nextSlotDate(thu, "Europe/London", new Date("2026-10-29T15:50:00Z")).date).toBe("2026-11-05");
    expect(nextSlotDate({ ...thu, weekday: 1 }, "Europe/London", new Date("2026-11-02T09:00:00Z")).date).toBe("2026-11-09");
  });

  it("crosses daylight saving changes on both sides of the world", () => {
    expect(nextSlotDate({ ...thu, weekday: 0 }, "Europe/Berlin", new Date("2026-10-23T16:00:00Z")).date).toBe("2026-10-25");
    expect(nextSlotDate({ ...thu, weekday: 0 }, "America/New_York", new Date("2026-10-30T12:00:00Z")).date).toBe("2026-11-01");
    expect(nextSlotDate({ ...thu, weekday: 1 }, "Australia/Sydney", new Date("2026-10-02T15:00:00Z")).date).toBe("2026-10-05");
  });

  it("wraps the end time past midnight and falls back on bad input", () => {
    expect(nextSlotDate({ weekday: 5, start: "22:30", durationMin: 150 }, "UTC", new Date("2026-10-25T00:00:00Z"))).toEqual({ date: "2026-10-30", start: "22:30", end: "01:00" });
    expect(nextSlotDate({ weekday: 5, start: "nope", durationMin: -5 }, "Not/AZone", new Date("2026-10-25T00:00:00Z"))).toEqual({ date: "2026-10-30", start: "19:00", end: "22:00" });
  });
});

describe("nextMondayNine", () => {
  it("lands on 09:00 local after the clocks go back", () => {
    expect(nextMondayNine("Europe/Berlin", new Date("2026-10-24T12:00:00Z")).toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(nextMondayNine("Europe/Berlin", new Date("2026-10-18T12:00:00Z")).toISOString()).toBe("2026-10-19T07:00:00.000Z");
    expect(nextMondayNine("America/New_York", new Date("2026-10-30T12:00:00Z")).toISOString()).toBe("2026-11-02T14:00:00.000Z");
    expect(nextMondayNine("America/New_York", new Date("2026-10-23T12:00:00Z")).toISOString()).toBe("2026-10-26T13:00:00.000Z");
  });

  it("lands on 09:00 local after the clocks go forward", () => {
    expect(nextMondayNine("Australia/Sydney", new Date("2026-10-03T00:00:00Z")).toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(nextMondayNine("America/Los_Angeles", new Date("2026-03-07T12:00:00Z")).toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });

  it("uses this Monday before nine and next Monday after", () => {
    expect(nextMondayNine("Asia/Kolkata", new Date("2026-10-26T03:00:00Z")).toISOString()).toBe("2026-10-26T03:30:00.000Z");
    expect(nextMondayNine("Asia/Kolkata", new Date("2026-10-26T03:30:00Z")).toISOString()).toBe("2026-11-02T03:30:00.000Z");
    expect(nextMondayNine("Bad/Zone", new Date("2026-10-25T00:00:00Z")).toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("is always 09:00 on a Monday in the zone", () => {
    for (const tz of ["Europe/London", "America/Sao_Paulo", "Asia/Kathmandu", "Pacific/Chatham", "America/St_Johns"]) {
      let t = new Date("2026-01-01T00:00:00Z");
      for (let i = 0; i < 60; i++) {
        const next = nextMondayNine(tz, t);
        const p = localParts(next, tz);
        expect([p.weekday, p.hour, p.minute], `${tz} ${t.toISOString()}`).toEqual([1, 9, 0]);
        expect(next.getTime()).toBeGreaterThan(t.getTime());
        expect(next.getTime() - t.getTime()).toBeLessThanOrEqual(7 * 86400000 + 3600000);
        t = new Date(next.getTime() + 3 * 86400000 + 7777000);
      }
    }
  });
});

describe("time helpers", () => {
  it("converts wall time to UTC and writes dates out", () => {
    expect(zonedToUtc(2026, 10, 24, 1, 30, "Europe/London").toISOString()).toBe("2026-10-24T00:30:00.000Z");
    const twice = zonedToUtc(2026, 10, 25, 1, 30, "Europe/London");
    expect([localParts(twice, "Europe/London").hour, localParts(twice, "Europe/London").minute]).toEqual([1, 30]);
    expect(zonedToUtc(2026, 10, 25, 9, 0, "Europe/London").toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(describeDate("2026-11-06")).toBe("Friday 6 November");
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});
