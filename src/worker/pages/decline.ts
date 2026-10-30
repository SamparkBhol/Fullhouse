import { NOTE_MAX, NO_REASONS, reasonWords, type NoReason } from "../../shared/answers.ts";
import { esc } from "./html.ts";

// Not this time opens the reasons first; the no is sent only from inside, with one of them picked.
export function declineForm(slug: string, venue: string): string {
  const picks = NO_REASONS.map(
    (r) => `<label class="pick"><input type="radio" name="reason" value="${r.key}" required> ${esc(r.words)}</label>`,
  ).join("");
  return (
    `<details class="decline"><summary class="btn btn-quiet">Not this time</summary>` +
    `<form method="post" action="/i/${esc(slug)}/answer" class="decline-form"><input type="hidden" name="answer" value="no">` +
    `<fieldset><legend>Tell ${esc(venue)} why, so the next ask fits better</legend>${picks}` +
    `<label class="note">In a few words<input type="text" name="note" maxlength="${NOTE_MAX}" autocomplete="off"></label></fieldset>` +
    `<button class="btn" type="submit">Send not this time</button>` +
    `<p class="small">Only ${esc(venue)} sees your reason. Nothing goes up with your name on it.</p></form></details>`
  );
}

export function declinedLine(venue: string, reason?: NoReason): string {
  const why = reason ? ` ${esc(venue)} sees your reason, ${esc(reasonWords(reason).toLowerCase())}.` : "";
  return `<p class="going">You said not this time. Nothing goes up with your name on it.</p>${why ? `<p>${why.trim()}</p>` : ""}`;
}
