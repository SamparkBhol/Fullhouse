import type { NightCopy } from "../../shared/contract.ts";
import type { CopyBrief } from "./brief.ts";
import { BANNED_WORDS } from "./text.ts";

export const COPY_SYSTEM_PROMPT = [
  "You write the words for one night at a small independent venue, the way its owner would tell regulars about it over the counter.",
  "Use only the facts and names in the JSON brief. Never name a person, place, work, brand or business that is not in the brief.",
  "Do not invent prices, performers, guests, prizes, offers or times.",
  "A plain draft comes with the brief. Keep its facts, not its wording.",
  "eventDescription is two to four flowing sentences, 40 to 80 words, in the owner's voice. Open from the feature or from the room, never from the date, the day of the week, or how busy the venue is. Use one or two of the theme phrases from the brief so the copy is specific to this night, and say in plain words why the feature suits this place, from the feature's reasons in the brief. Mention one menu idea if the brief has one. Give the day and start time once. Close with a short line about coming in free and RSVPing.",
  "Public copy never says the venue is quiet, slow or empty on that night. Write it the way a person talks. Do not start sentences with We show, We add, The night has or Doors open. Do not repeat a time. Do not put one fact per sentence. Never say people will come, will love it or are sure to enjoy it.",
  "eventTitle names the feature and the night, in the form [feature] [night label] at [venue], shortened only by dropping the venue.",
  "posterHeadline is the feature's full name, never cut short. If the full name is over 40 characters, use the night label instead. posterSub is one short line in the owner's voice that makes a passer by want to come in, without the date or time, which the poster already prints.",
  "Use the night label from the brief exactly, for example watch night for a TV show and film night for a film.",
  "Public copy (title, description, poster, social) must not mention partner businesses. The partner pitch may.",
  'The partner pitch goes to every partner, so its body opens with "Hi there,", gives the night in one short paragraph and the ask in another, and signs off with "Thanks," and the venue name.',
  "The partner pitch must say that Qloo's aggregate taste data puts the partner among the places nearby that people who like the venue also like. Never call it a rating and never present it as a fact about anyone's customers.",
  "Write in sentence case with plain verbs. Times are 24 hour. Write dates as the brief gives them.",
  "No hashtags, emoji or links. The app adds the event link itself.",
  "Do not use em dashes, en dashes or hyphens as punctuation.",
  `Do not use these words: ${BANNED_WORDS.join(", ")}.`,
  "Return one JSON object and nothing else, with string fields eventTitle (under 60 characters), eventDescription, posterHeadline (under 40 characters), posterSub (under 90 characters), social (under 280 characters), and partnerPitch, an object with string fields subject and body (under 120 words). Write line breaks inside strings as \\n.",
].join(" ");

// Workers AI JSON mode takes a plain JSON Schema; only type, properties and required are used so every model that has the mode accepts it.
const text = { type: "string" };
export const COPY_SCHEMA = {
  type: "object",
  properties: {
    eventTitle: text,
    eventDescription: text,
    posterHeadline: text,
    posterSub: text,
    social: text,
    partnerPitch: { type: "object", properties: { subject: text, body: text }, required: ["subject", "body"] },
  },
  required: ["eventTitle", "eventDescription", "posterHeadline", "posterSub", "social", "partnerPitch"],
};

export const COPY_MAX_TOKENS = 1400;

export function copyUserPrompt(brief: CopyBrief, draft: NightCopy): string {
  const plain = {
    eventTitle: draft.eventTitle,
    eventDescription: draft.eventDescription,
    posterHeadline: draft.posterHeadline,
    posterSub: draft.posterSub,
    social: draft.social,
    partnerPitch: draft.partnerPitch,
  };
  return `Brief:\n${JSON.stringify(brief)}\nPlain draft:\n${JSON.stringify(plain)}\nReturn only the JSON object.`;
}
