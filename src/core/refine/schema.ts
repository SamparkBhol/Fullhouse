import { FORMAT_ORDER } from "../planner/formats.ts";

export const MIN_DURATION = 30;
export const MAX_DURATION = 360;
export const MAX_PEOPLE = 1000;
export const NOTE_MAX = 200;

export const REFINE_TOOL: { name: string; description: string; parameters: Record<string, unknown> } = {
  name: "refine_night",
  description:
    "Change the settings of a planned night at a small venue. Set only the fields the owner's request changes. Leave everything else out.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      weekday: { type: "integer", minimum: 0, maximum: 6, description: "Day of the week for the night, 0 is Sunday, 1 is Monday, 6 is Saturday." },
      start: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", description: "Start time in 24 hour HH:MM, for example 19:30." },
      durationMin: { type: "integer", minimum: MIN_DURATION, maximum: MAX_DURATION, description: "Length of the night in minutes." },
      maxPeople: { type: "integer", minimum: 1, maximum: MAX_PEOPLE, description: "Most people the owner wants in the room." },
      avoidFormats: { type: "array", items: { type: "string", enum: FORMAT_ORDER }, description: "Night formats the owner does not want." },
      preferFormats: { type: "array", items: { type: "string", enum: FORMAT_ORDER }, description: "Night formats the owner asked for." },
      noLiveMusic: { type: "boolean", description: "True when the owner says no live music or no bands." },
      note: { type: "string", maxLength: NOTE_MAX, description: "Anything else the owner asked for, in their words." },
    },
  },
};
