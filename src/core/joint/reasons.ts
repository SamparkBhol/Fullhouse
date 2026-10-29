import type { CrowdSplit } from "../../shared/contract.ts";
import { plainName } from "../../shared/words.ts";

export function splitText(split: CrowdSplit, venueName: string, partnerName: string): string {
  return `${plainName(venueName)} crowd ${split.venue}, ${plainName(partnerName)} crowd ${split.partner}`;
}
