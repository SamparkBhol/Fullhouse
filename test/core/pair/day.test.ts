import { describe, expect, it } from "vitest";
import type { QuietSlot } from "../../../src/shared/contract.ts";
import { chooseDay } from "../../../src/core/planner/day.ts";
import { hoursListed, hoursVerdict } from "../../../src/core/planner/hours.ts";
import { REGGIO, livePlaces, placeNamed } from "./live.ts";

// Thursday 29 October 2026, noon in New York.
const NOW = new Date("2026-10-29T16:00:00.000Z");
const TUESDAY: QuietSlot = { weekday: 2, start: "19:00", durationMin: 180 };

const reggio = REGGIO();
const places = livePlaces("reggio_loved");
const veselka = placeNamed(places, "Veselka");

function day(partnerName: string, slot = TUESDAY) {
  const partner = placeNamed(places, partnerName);
  return chooseDay(slot, reggio.tz, NOW, [
    { place: reggio.entity, start: slot.start, role: "venue" },
    { place: partner, start: slot.start, role: "partner" },
  ]);
}

describe("the day both places are open", () => {
  it("reads Veselka's week of closed days as hours not listed, not as closed on Tuesdays", () => {
    expect(hoursListed(veselka)).toBe(false);
    expect(hoursVerdict(veselka, 2, "19:00")).toBe("unknown");
    expect(hoursVerdict(reggio.entity, 2, "19:00")).toBe("open");
  });

  it("keeps Caffe Reggio's quiet Tuesday with Veselka and says to check Veselka's hours", () => {
    const d = day("Veselka");
    expect(d).toMatchObject({ date: "2026-11-03", weekday: 2, moved: false });
    expect(d.note).toBe("Veselka has no opening hours listed, so check Veselka is open on Tuesday 3 November before you ask.");
  });

  it("moves off a Tuesday the partner is known to be closed, to the nearest weekday evening both are open", () => {
    const d = day("Fanelli Café");
    expect(hoursVerdict(placeNamed(places, "Fanelli Café"), 2, "19:00")).toBe("closed");
    expect(d).toMatchObject({ date: "2026-11-05", weekday: 4, moved: true });
    expect(d.note).toBe("Fanelli Café is not open on Tuesdays at 19:00, so the night moves to Thursday 5 November, the nearest evening both places are open.");
  });

  it("takes the next day over the day before when both are as near", () => {
    const d = day("B&H Dairy", { ...TUESDAY, weekday: 1 });
    expect(d).toMatchObject({ date: "2026-11-03", weekday: 2, moved: true });
  });

  it("never schedules a day either place is known to be closed", () => {
    for (const p of places) {
      for (const weekday of [0, 1, 2, 3, 4, 5, 6] as const) {
        const d = chooseDay({ ...TUESDAY, weekday }, reggio.tz, NOW, [
          { place: reggio.entity, start: "19:00", role: "venue" },
          { place: p, start: "19:00", role: "partner" },
        ]);
        if (!d.moved && d.note?.startsWith("By their listed hours")) continue;
        expect(hoursVerdict(p, d.weekday, "19:00"), `${p.name} ${weekday}`).not.toBe("closed");
        expect(new Date(`${d.date}T12:00:00Z`).getUTCDay()).toBe(d.weekday);
      }
    }
  });

  it("says to pick another start time when no evening has both open", () => {
    const shut = { ...placeNamed(places, "Think Coffee"), name: "Think Coffee" };
    const d = chooseDay(TUESDAY, reggio.tz, NOW, [
      { place: reggio.entity, start: "19:00", role: "venue" },
      { place: shut, start: "19:00", role: "partner" },
    ]);
    expect(d.moved).toBe(false);
    expect(d.note).toBe("By their listed hours the two places are never open together at 19:00, so pick another start time before you ask.");
  });
});
