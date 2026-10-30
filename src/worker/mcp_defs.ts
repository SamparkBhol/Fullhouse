import { z } from "zod";
import type { McpToolRow } from "../shared/contract.ts";
import { NIGHT_ID_RE, VENUE_ID_RE } from "./ids.ts";
import { ACTIONS, FORMATS } from "./validate.ts";

const ownerArgs = {
  venue_id: z.string().regex(VENUE_ID_RE).describe("The venue id from the owner link /v/<venue_id>"),
  owner_token: z.string().min(10).max(128).describe("The owner token from the owner link after #t="),
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const loose = (shape: Record<string, z.ZodType>) => z.looseObject(shape);

// The definitions the server registers. The How it works page lists the same objects.
export const TOOLS = {
  find_venue: {
    title: "Find a venue",
    description: "Look up a venue by name and city in Qloo and return up to 8 matching places with address, coordinates and tags.",
    inputSchema: z.object({ name: z.string().min(1).max(120), city: z.string().min(1).max(120) }),
    outputSchema: z.object({ candidates: z.array(loose({ id: z.string(), name: z.string() })) }),
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  read_street: {
    title: "Read the street",
    description: "Run or refresh the street read for the owner's venue: heat cells, street and venue taste tags, the gap, loved places nearby and the picks its audience loves, each with its Qloo provenance.",
    inputSchema: z.object({ ...ownerArgs, refresh: z.boolean().optional().describe("Run a fresh read even if one is stored") }),
    outputSchema: z.object({ read: loose({ venueId: z.string(), at: z.string() }) }),
    annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: true },
  },
  propose_night: {
    title: "Propose a night",
    description:
      "Draft a night for the venue's quiet slot plus two alternatives, every pick with its Qloo reason. Pass plan_id with change_request to refine an earlier plan in plain words. Nothing is published.",
    inputSchema: z.object({
      ...ownerArgs,
      weekday: z.number().int().min(0).max(6).optional(),
      start: hhmm.optional(),
      duration_min: z.number().int().min(30).max(720).optional(),
      max_people: z.number().int().min(1).max(5000).optional(),
      avoid_formats: z.array(z.enum(FORMATS)).max(7).optional(),
      prefer_formats: z.array(z.enum(FORMATS)).max(7).optional(),
      no_live_music: z.boolean().optional(),
      plan_id: z.string().regex(NIGHT_ID_RE).optional(),
      change_request: z.string().min(1).max(500).optional(),
    }),
    outputSchema: loose({ plan: loose({ id: z.string() }), alternatives: z.array(loose({ id: z.string() })) }),
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  publish_night: {
    title: "Prepare a night for the owner's approval",
    description:
      "Publishes nothing. Checks the plan and returns the link to the approval screen, where the owner sees every action (event page, poster, calendar file, Google Calendar link, partner drafts, Eventbrite, owner email) and says yes.",
    inputSchema: z.object({
      ...ownerArgs,
      plan_id: z.string().regex(NIGHT_ID_RE),
      actions: z.array(z.enum(ACTIONS)).max(ACTIONS.length).optional().describe("The actions to suggest; the owner chooses on the screen"),
    }),
    outputSchema: z.object({ approveUrl: z.string(), plan: loose({ id: z.string() }), actions: z.array(loose({ kind: z.string(), does: z.string() })) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  log_turnout: {
    title: "Log turnout",
    description: "Record how many people came to an approved night, with an optional note. The number stays with the venue and is never sent to Qloo.",
    inputSchema: z.object({
      ...ownerArgs,
      night_id: z.string().regex(NIGHT_ID_RE),
      headcount: z.number().int().min(0).max(100000),
      note: z.string().max(500).optional(),
    }),
    outputSchema: z.object({ night: loose({ id: z.string(), headcount: z.number() }) }),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  },
} as const;

export type ToolName = keyof typeof TOOLS;

export function toolRows(): McpToolRow[] {
  return (Object.entries(TOOLS) as Array<[string, (typeof TOOLS)[ToolName]]>).map(([name, def]) => {
    const schema = z.toJSONSchema(def.inputSchema) as { properties?: Record<string, { description?: string }>; required?: string[] };
    const required = new Set(schema.required ?? []);
    const args = Object.entries(schema.properties ?? {}).map(([arg, prop]) => ({
      name: arg,
      required: required.has(arg),
      ...(prop.description ? { note: prop.description } : {}),
    }));
    return { name, title: def.title, description: def.description, readOnly: def.annotations.readOnlyHint === true, args };
  });
}
