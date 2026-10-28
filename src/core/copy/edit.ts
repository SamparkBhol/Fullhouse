import type { EditableCopy, NightCopy } from "../../shared/contract.ts";
import { listWords } from "../../shared/words.ts";
import { bannedIn } from "./text.ts";
import { cleanCopyField } from "./write.ts";

const EDITABLE: (keyof EditableCopy)[] = ["eventTitle", "eventDescription", "posterHeadline", "posterSub"];

const LABEL: Record<keyof EditableCopy, string> = {
  eventTitle: "title",
  eventDescription: "description",
  posterHeadline: "poster headline",
  posterSub: "poster line",
};

// The owner's own words go out under their name, so only the public gate applies: length, dashes and banned words.
export function applyCopyEdits(copy: NightCopy, edits: EditableCopy): { copy: NightCopy } | { problem: string } {
  const next: NightCopy = { ...copy };
  let changed = false;
  for (const key of EDITABLE) {
    const raw = edits[key];
    if (raw === undefined || raw.trim() === copy[key]) continue;
    const clean = cleanCopyField(key, raw);
    if (clean === null) return { problem: `The ${LABEL[key]} is empty, too long or uses a dash as punctuation.` };
    const banned = bannedIn(clean);
    if (banned.length) return { problem: `The ${LABEL[key]} uses ${listWords(banned)}, which the public pages do not allow.` };
    next[key] = clean;
    changed = true;
  }
  if (changed) next.editedByOwner = true;
  return { copy: next };
}
