import { McpServer, WebStandardStreamableHTTPServerTransport, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ApproveInput, PlanInput, VenueCandidate } from "../shared/contract.ts";
import { NIGHT_ID_RE, VENUE_ID_RE } from "./tokens.ts";
import { ACTIONS, FORMATS } from "./validate.ts";
import type { Out, VenueApi } from "./venue_core.ts";

export const MCP_VERSION = "0.1.0";

export interface McpPorts {
  findVenues(name: string, city: string): Promise<Out<VenueCandidate[]>>;
  owner(venueId: string, ownerToken: string): Promise<VenueApi | null>;
  origin: string;
}

const INSTRUCTIONS =
  "Full House plans a quiet night for a small venue from Qloo taste data. Call find_venue first and let the owner pick the right place. " +
  "Owner tools need the venue_id and owner_token from the owner's Full House link. propose_night only drafts. " +
  "Call publish_night only after the owner has read the plan and said yes to each listed action. Never claim a result Qloo did not return.";

const ownerArgs = {
  venue_id: z.string().regex(VENUE_ID_RE).describe("The venue id from the owner link /v/<venue_id>"),
  owner_token: z.string().min(10).max(128).describe("The owner token from the owner link after #t="),
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const loose = (shape: Record<string, z.ZodType>) => z.looseObject(shape);

function textAndData(summary: string, data: Record<string, unknown>, includeJson = true): CallToolResult {
  return {
    content: [{ type: "text", text: includeJson ? `${summary}\n${JSON.stringify(data)}` : summary }],
    structuredContent: data,
  };
}

function toolError(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function outError<T>(out: Out<T>): CallToolResult | null {
  if (out.ok) return null;
  return toolError(out.detail ? `${out.error}: ${out.detail}` : out.error);
}

const UNAUTHORIZED = "The venue_id and owner_token do not match. Use the values from the owner's Full House link.";

export function buildMcpServer(ports: McpPorts): McpServer {
  const server = new McpServer({ name: "fullhouse", title: "Full House", version: MCP_VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "find_venue",
    {
      title: "Find a venue",
      description: "Look up a venue by name and city in Qloo and return up to 8 matching places with address, coordinates and tags.",
      inputSchema: z.object({ name: z.string().min(1).max(120), city: z.string().min(1).max(120) }),
      outputSchema: z.object({ candidates: z.array(loose({ id: z.string(), name: z.string() })) }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ name, city }) => {
      const out = await ports.findVenues(name, city);
      if (!out.ok) return outError(out) as CallToolResult;
      const n = out.value.length;
      return textAndData(n ? `Qloo returned ${n} places for "${name}" in ${city}.` : `Qloo returned no places for "${name}" in ${city}.`, {
        candidates: out.value,
      });
    },
  );

  server.registerTool(
    "read_street",
    {
      title: "Read the street",
      description: "Run or refresh the street read for the owner's venue: heat cells, street and venue taste tags, the gap, loved places nearby and what is rising, each with its Qloo provenance.",
      inputSchema: z.object({ ...ownerArgs, refresh: z.boolean().optional().describe("Run a fresh read even if one is stored") }),
      outputSchema: z.object({ read: loose({ venueId: z.string(), at: z.string() }) }),
      annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: true },
    },
    async ({ venue_id, owner_token, refresh }) => {
      const venue = await ports.owner(venue_id, owner_token);
      if (!venue) return toolError(UNAUTHORIZED);
      let out = refresh ? await venue.read() : null;
      if (!out) {
        const state = await venue.state();
        if (!state.ok) return outError(state) as CallToolResult;
        out = state.value.read ? { ok: true, value: state.value.read } : await venue.read();
      }
      if (!out.ok) return outError(out) as CallToolResult;
      const r = out.value;
      const summary =
        `Street read at ${r.at}: ${r.lovedPlaces.length} loved places nearby, ${r.rising.length} rising picks, ${r.gaps.length} gaps, ` +
        `${r.provenance.length} Qloo calls. Limits: ${r.limits.join(" ")}`;
      return textAndData(summary, { read: r }, false);
    },
  );

  server.registerTool(
    "propose_night",
    {
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
    async (args) => {
      const venue = await ports.owner(args.venue_id, args.owner_token);
      if (!venue) return toolError(UNAUTHORIZED);
      let out;
      if (args.plan_id && args.change_request) {
        out = await venue.refine(args.plan_id, args.change_request);
      } else {
        const input: PlanInput = {};
        if (args.weekday !== undefined) input.weekday = args.weekday as PlanInput["weekday"];
        if (args.start) input.start = args.start;
        if (args.duration_min) input.durationMin = args.duration_min;
        if (args.max_people) input.maxPeople = args.max_people;
        if (args.avoid_formats) input.avoidFormats = args.avoid_formats;
        if (args.prefer_formats) input.preferFormats = args.prefer_formats;
        if (args.no_live_music !== undefined) input.noLiveMusic = args.no_live_music;
        out = await venue.plan(input);
      }
      if (!out.ok) return outError(out) as CallToolResult;
      const p = out.value.plan;
      return textAndData(
        `Proposed "${p.copy.eventTitle}" (${p.format}) on ${p.date} from ${p.start} to ${p.end}, plan id ${p.id}. Nothing is published until publish_night.`,
        out.value as unknown as Record<string, unknown>,
      );
    },
  );

  server.registerTool(
    "publish_night",
    {
      title: "Publish an approved night",
      description:
        "Run the actions the owner approved for one plan: public event page, poster, calendar file, Google Calendar link, partner email drafts (drafted, never sent), Eventbrite event if connected, and an email to the owner.",
      inputSchema: z.object({
        ...ownerArgs,
        plan_id: z.string().regex(NIGHT_ID_RE),
        actions: z.array(z.enum(ACTIONS)).min(1).max(ACTIONS.length),
        partner_emails: z.record(z.string().regex(/^[A-Za-z0-9:_-]{1,80}$/), z.string().max(254)).optional().describe("Partner place id to the address the owner typed"),
      }),
      outputSchema: z.object({ night: loose({ id: z.string(), actions: z.array(loose({ kind: z.string(), ok: z.boolean() })) }) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args) => {
      const venue = await ports.owner(args.venue_id, args.owner_token);
      if (!venue) return toolError(UNAUTHORIZED);
      const input: ApproveInput = { actions: [...new Set(args.actions)] };
      if (args.partner_emails) input.partnerEmails = args.partner_emails;
      const out = await venue.approve(args.plan_id, input, ports.origin);
      if (!out.ok) return outError(out) as CallToolResult;
      const done = out.value.actions.map((a) => `${a.label}: ${a.ok ? (a.url ?? "done") : `not done, ${a.detail}`}`).join("\n");
      return textAndData(`Published "${out.value.copy.eventTitle}".\n${done}`, { night: out.value });
    },
  );

  server.registerTool(
    "log_turnout",
    {
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
    async (args) => {
      const venue = await ports.owner(args.venue_id, args.owner_token);
      if (!venue) return toolError(UNAUTHORIZED);
      const out = await venue.result(args.night_id, args.headcount, args.note);
      if (!out.ok) return outError(out) as CallToolResult;
      return textAndData(`Logged ${args.headcount} people for "${out.value.copy.eventTitle}".`, { night: out.value });
    },
  );

  return server;
}

export async function handleMcp(request: Request, parsedBody: unknown, ports: McpPorts): Promise<Response> {
  const server = buildMcpServer(ports);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody });
  } finally {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  }
}
