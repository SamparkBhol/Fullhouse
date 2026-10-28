import type { Venue } from "../../src/shared/contract.ts";

// A quiet night three days out keeps the night in the future whatever day the suite runs.
export function weekdayInThreeDays(): Venue["quietSlot"]["weekday"] {
  return ((new Date().getUTCDay() + 3) % 7) as Venue["quietSlot"]["weekday"];
}
