import type { LovedPlace } from "../../shared/contract.ts";
import { listedHours } from "../../shared/hours.ts";

export { DAY_PLURAL, hoursLine, hoursVerdict, listedHours, spansOn, type HoursVerdict } from "../../shared/hours.ts";

export function hoursListed(p: Pick<LovedPlace, "hours">): boolean {
  return listedHours(p) !== null;
}
