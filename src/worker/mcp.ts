import { McpServer, WebStandardStreamableHTTPServerTransport, type CallToolResult } from "@modelcontextprotocol/server";
import type { ActionKind, PlanInput, VenueCandidate } from "../shared/contract.ts";
import { TOOLS } from "./mcp_defs.ts";
import type { LimitKind } from "./meter_core.ts";
import type { Out, VenueApi } from "./venue/api.ts";

export const MCP_VERSION = "0.1.0";

export interface McpPorts {
  findVenues(name: string, city: string): Promise<Out<VenueCandidate[]>>;
  owner(venueId: string, ownerToken: string): Promise<VenueApi | null>;
  limit(kind: LimitKind): Promise<Out<never> | null>;
  origin: string;
  toolDone?(tool: string, ok: boolean): void;
}

const INSTRUCTIONS =
  "Full House plans a quiet night for a small venue from Qloo taste data. Call find_venue first and let the owner pick the right place. " +
  "Owner tools need the venue_id and owner_token from the owner's Full House link. propose_night only drafts. " +
  "publish_night publishes nothing: it returns the approval screen where the owner reads the plan and says yes. Never claim a result Qloo did not return.";

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

const ACTION_WORDS: Record<ActionKind, string> = {
  event_page: "puts a public event page online with an RSVP count",
  poster: "makes a printable poster with a QR code",
  ics: "makes a calendar file",
  gcal: "makes a Google Calendar link",
  outreach: "drafts a note to each partner in the owner's own mail app, never sent by Full House",
  eventbrite: "creates and publishes the event on the owner's Eventbrite, listed in Eventbrite's public search",
  owner_email: "emails the links to the owner's confirmed address",
};

const UNAUTHORIZED = "The venue_id and owner_token do not match. Use the values from the owner's Full House link.";

type Handler = (...args: unknown[]) => Promise<CallToolResult>;

// registerTool with the same types, reporting each call that reached its handler and whether it came back an error.
function reportingTools(server: McpServer, done: McpPorts["toolDone"]): McpServer["registerTool"] {
  const register = server.registerTool.bind(server) as unknown as (name: string, config: unknown, cb: Handler) => ReturnType<McpServer["registerTool"]>;
  const wrapped = (name: string, config: unknown, cb: Handler) =>
    register(name, config, async (...args) => {
      const result = await cb(...args);
      done?.(name, !result.isError);
      return result;
    });
  return wrapped as unknown as McpServer["registerTool"];
}

export function buildMcpServer(ports: McpPorts): McpServer {
  const server = new McpServer({ name: "fullhouse", title: "Full House", version: MCP_VERSION }, { instructions: INSTRUCTIONS });
  const tool = reportingTools(server, ports.toolDone);

  tool(
    "find_venue",
    TOOLS.find_venue,
    async ({ name, city }) => {
      const out = await ports.findVenues(name, city);
      if (!out.ok) return outError(out) as CallToolResult;
      const n = out.value.length;
      return textAndData(n ? `Qloo returned ${n} places for "${name}" in ${city}.` : `Qloo returned no places for "${name}" in ${city}.`, {
        candidates: out.value,
      });
    },
  );

  tool(
    "read_street",
    TOOLS.read_street,
    async ({ venue_id, owner_token, refresh }) => {
      const venue = await ports.owner(venue_id, owner_token);
      if (!venue) return toolError(UNAUTHORIZED);
      const blocked = await ports.limit("read");
      if (blocked) return outError(blocked) as CallToolResult;
      let out = refresh ? await venue.read() : null;
      if (!out) {
        const state = await venue.state();
        if (!state.ok) return outError(state) as CallToolResult;
        out = state.value.read ? { ok: true, value: state.value.read } : await venue.read();
      }
      if (!out.ok) return outError(out) as CallToolResult;
      const r = out.value;
      const summary =
        `Street read at ${r.at}: ${r.lovedPlaces.length} loved places nearby, ${r.rising.length} picks, ${r.gaps.length} gaps, ` +
        `${r.provenance.length} Qloo calls. Limits: ${r.limits.join(" ")}`;
      return textAndData(summary, { read: r }, false);
    },
  );

  tool(
    "propose_night",
    TOOLS.propose_night,
    async (args) => {
      const venue = await ports.owner(args.venue_id, args.owner_token);
      if (!venue) return toolError(UNAUTHORIZED);
      const blocked = await ports.limit("plan");
      if (blocked) return outError(blocked) as CallToolResult;
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
        `Proposed "${p.copy.eventTitle}" (${p.format}) on ${p.date} from ${p.start} to ${p.end}, plan id ${p.id}. Nothing is published until the owner approves it on the approval screen.`,
        out.value as unknown as Record<string, unknown>,
      );
    },
  );

  tool(
    "publish_night",
    TOOLS.publish_night,
    async (args) => {
      const venue = await ports.owner(args.venue_id, args.owner_token);
      if (!venue) return toolError(UNAUTHORIZED);
      const state = await venue.state();
      if (!state.ok) return outError(state) as CallToolResult;
      const plan = state.value.proposals.find((p) => p.id === args.plan_id);
      if (!plan) return toolError("That plan is not among the current proposals. Call propose_night first.");
      const kinds: ActionKind[] = args.actions?.length ? [...new Set(args.actions)] : ["event_page", "poster", "ics", "gcal", "outreach"];
      const actions = kinds.map((kind) => ({ kind, does: ACTION_WORDS[kind] }));
      const approveUrl = `${ports.origin}/v/${args.venue_id}/night/${plan.id}/approve`;
      const list = actions.map((a) => `${a.kind}: ${a.does}`).join("\n");
      return textAndData(
        `Nothing was published. Send the owner to ${approveUrl} to read "${plan.copy.eventTitle}" and approve it. On that screen they can tick:\n${list}`,
        { approveUrl, plan: { id: plan.id, title: plan.copy.eventTitle, date: plan.date, start: plan.start, end: plan.end }, actions },
        false,
      );
    },
  );

  tool(
    "log_turnout",
    TOOLS.log_turnout,
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
