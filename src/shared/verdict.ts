// Full House's one word on a fit score, the same on the owner's screens and the partner's invite.
export function verdictWord(score: number): string {
  if (score >= 85) return "A strong pair";
  if (score >= 70) return "A good pair";
  if (score >= 55) return "Worth a try";
  return "A long shot";
}
