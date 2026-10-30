import { FORMATS } from "../../core/index.ts";
import type { Match, Night, NightFormat } from "../../shared/contract.ts";
import { listWords, plainName } from "../../shared/words.ts";
import type { StepResult } from "./agent_trace.ts";

const kind = (f: NightFormat): string => FORMATS[f]?.label.toLowerCase() ?? f;

export function formatsRunWith(nights: Night[], partnerId: string | undefined): NightFormat[] {
  if (!partnerId) return [];
  const ran = nights.filter((n) => !n.withdrawnAt && n.match?.partner.id.toUpperCase() === partnerId.toUpperCase()).map((n) => n.format);
  return [...new Set(ran)];
}

// The partner of the read before this one is last week's when that read is about a week old.
export function partnerStep(before: Match | undefined, after: Match | undefined, at: Date): StepResult {
  const aWeek = before ? at.getTime() - Date.parse(before.readAt) >= 5 * 86_400_000 : false;
  const prior = aWeek ? "last week's partner" : "the partner from the last read";
  if (!after) {
    return {
      did: before ? `Checked ${prior}, ${plainName(before.partner.name)}, against the new read` : "Looked for a partner on the new read",
      outcome: before ? `${plainName(before.partner.name)} no longer fits and nothing else on the list does, so this night is the venue's own.` : "No place on the list can host and fits, so this night is the venue's own.",
    };
  }
  const now = plainName(after.partner.name);
  const score = after.partner.fit?.score;
  const of = score === undefined ? "" : `, ${score} of 100`;
  if (!before) return { did: "Looked for a partner on the new read", outcome: `Picked ${now}${of}.` };
  const was = plainName(before.partner.name);
  if (before.partner.id.toUpperCase() === after.partner.id.toUpperCase()) {
    const was0 = before.partner.fit?.score;
    const move = was0 === undefined || score === undefined ? "" : was0 === score ? `, still ${score} of 100` : `, ${score} of 100 against ${was0} before`;
    return { did: `Checked ${prior}, ${was}, against the new read`, outcome: `${was} is still the best fit${move}.` };
  }
  const row = after.considered?.find((c) => c.id.toUpperCase() === before.partner.id.toUpperCase());
  const scored = row?.score === undefined ? `${was} was not scored this time.` : `${was} now scores ${row.score} of 100.`;
  const why = row ? ` ${scored} ${row.reason}` : ` ${was} is no longer on the list.`;
  return { did: `Checked ${prior}, ${was}, against the new read`, outcome: `Switched to ${now}${of}.${why}` };
}

export function formatsStep(partnerName: string | undefined, run: NightFormat[], avoid: NightFormat[] | undefined, prefer: NightFormat[] | undefined): StepResult {
  const who = partnerName ? plainName(partnerName) : "this venue";
  const parts: string[] = [];
  if (run.length) parts.push(`${listWords(run.map(kind))} already ran with ${who}`);
  const turnout = (avoid ?? []).filter((f) => !run.includes(f));
  if (turnout.length) parts.push(`last night's turnout says to change ${listWords(turnout.map(kind))}`);
  if (prefer?.length) parts.push(`turnout says keep ${listWords(prefer.map(kind))} in the mix`);
  return {
    did: `Left out formats already run with ${who}`,
    outcome: parts.length ? `${parts.join(". ")}.`.replace(/^./, (c) => c.toUpperCase()) : `No night has run with ${who} yet, so every format is open.`,
  };
}
