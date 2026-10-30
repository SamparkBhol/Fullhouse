// Why a neighbour said not this time, picked on its invite page. Only the key is counted; the note goes to the owner alone.
export type NoReason = "kind" | "day" | "events" | "other";

export const NO_REASONS: ReadonlyArray<{ key: NoReason; words: string }> = [
  { key: "kind", words: "Not our kind of night" },
  { key: "day", words: "Wrong day or time" },
  { key: "events", words: "We do not run events" },
  { key: "other", words: "Something else" },
];

export const NO_REASON_KEYS = NO_REASONS.map((r) => r.key) as [NoReason, ...NoReason[]];

export const NOTE_MAX = 140;

// A no sent without a reason, from a script or a page cached before the reasons existed.
export type AnswerKey = "yes" | NoReason | "unsaid";

export const ANSWER_KEYS: readonly AnswerKey[] = ["yes", ...NO_REASON_KEYS, "unsaid"];

export function reasonWords(key: AnswerKey): string {
  if (key === "yes") return "Yes";
  if (key === "unsaid") return "No reason given";
  return NO_REASONS.find((r) => r.key === key)?.words ?? "Something else";
}
