import type {
  ApiError,
  ApproveInput,
  AgentRun,
  Baseline,
  CreateVenueInput,
  EditableCopy,
  Invite,
  JointExample,
  Match,
  McpTools,
  Night,
  PlanInput,
  PlanResponse,
  RunProgress,
  StreetRead,
  Venue,
  VenueCandidate,
  VenueSettingsInput,
  VenueState,
} from "../../src/shared/contract.ts";
import { parseExample, type Example } from "./joint.ts";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string | undefined,
    readonly network: boolean,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiFailure(0, "network", undefined, true);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>;
    throw new ApiFailure(res.status, typeof err.error === "string" ? err.error : `http_${res.status}`, err.detail, false);
  }
  return data as T;
}

export interface CreatedVenue {
  venue: Venue;
  ownerToken: string;
  ownerUrl: string;
}

export interface Health {
  qloo: boolean;
  ai: boolean;
  ownerEmail: boolean;
}

let health: Promise<Health> | null = null;

// The invite link goes into another person's mail or messages, so it always carries the full address.
function absolute(invite: Invite): Invite {
  try {
    return { ...invite, url: new URL(invite.url || `/i/${encodeURIComponent(invite.slug)}`, location.origin).href };
  } catch {
    return invite;
  }
}

const venuePath = (id: string, rest = "") => `/api/venues/${encodeURIComponent(id)}${rest}`;

export const api = {
  // Asked once per page load: whether this server can send email decides what the owner is offered.
  health(): Promise<Health> {
    health ??= call<Health>("/api/health").catch(() => ({ qloo: true, ai: false, ownerEmail: false }));
    return health;
  },
  search(name: string, city: string, near?: { lat: number; lng: number }): Promise<VenueCandidate[]> {
    return call<VenueCandidate[]>("/api/venues/search", { method: "POST", body: near ? { name, near } : { name, city } });
  },
  create(input: CreateVenueInput): Promise<CreatedVenue> {
    return call<CreatedVenue>("/api/venues", { method: "POST", body: input });
  },
  state(id: string, token: string): Promise<VenueState> {
    return call<VenueState>(venuePath(id), { token });
  },
  read(id: string, token: string): Promise<StreetRead> {
    return call<StreetRead>(venuePath(id, "/read"), { method: "POST", token, body: {} });
  },
  plan(id: string, token: string, input: PlanInput): Promise<PlanResponse> {
    return call<PlanResponse>(venuePath(id, "/plan"), { method: "POST", token, body: input });
  },
  refine(id: string, token: string, planId: string, request: string): Promise<PlanResponse> {
    return call<PlanResponse>(venuePath(id, "/refine"), { method: "POST", token, body: { planId, request } });
  },
  approve(id: string, token: string, planId: string, input: ApproveInput): Promise<Night> {
    return call<Night>(venuePath(id, `/nights/${encodeURIComponent(planId)}/approve`), { method: "POST", token, body: input });
  },
  result(id: string, token: string, nightId: string, turnout: { headcount: number; note?: string; capacity?: number }): Promise<Night> {
    return call<Night>(venuePath(id, `/nights/${encodeURIComponent(nightId)}/result`), { method: "POST", token, body: turnout });
  },
  unpublish(id: string, token: string, nightId: string): Promise<Night> {
    return call<Night>(venuePath(id, `/nights/${encodeURIComponent(nightId)}/unpublish`), { method: "POST", token, body: {} });
  },
  republish(id: string, token: string, nightId: string): Promise<Night> {
    return call<Night>(venuePath(id, `/nights/${encodeURIComponent(nightId)}/republish`), { method: "POST", token, body: {} });
  },
  editNight(id: string, token: string, nightId: string, copy: EditableCopy): Promise<Night> {
    return call<Night>(venuePath(id, `/nights/${encodeURIComponent(nightId)}/edit`), { method: "POST", token, body: { copy } });
  },
  settings(id: string, token: string, input: VenueSettingsInput): Promise<Venue> {
    return call<Venue>(venuePath(id, "/settings"), { method: "POST", token, body: input });
  },
  async eventbrite(id: string, token: string, privateToken: string): Promise<string> {
    return (await call<{ organization: string }>(venuePath(id, "/eventbrite"), { method: "POST", token, body: { token: privateToken } })).organization;
  },
  disconnectEventbrite(id: string, token: string): Promise<{ disconnected: true }> {
    return call<{ disconnected: true }>(venuePath(id, "/eventbrite"), { method: "DELETE", token });
  },
  newOwnerLink(id: string, token: string): Promise<{ ownerUrl: string; ownerToken: string }> {
    return call<{ ownerUrl: string; ownerToken: string }>(venuePath(id, "/owner-link"), { method: "POST", token, body: {} });
  },
  requestEmail(id: string, token: string, email: string): Promise<Venue> {
    return call<Venue>(venuePath(id, "/email"), { method: "POST", token, body: { email } });
  },
  confirmEmail(id: string, token: string, code: string): Promise<Venue> {
    return call<Venue>(venuePath(id, "/email/confirm"), { method: "POST", token, body: { code } });
  },
  remove(id: string, token: string): Promise<{ deleted: true }> {
    return call<{ deleted: true }>(venuePath(id), { method: "DELETE", token });
  },
  baseline(id: string, token: string): Promise<Baseline> {
    return call<Baseline>(venuePath(id, "/baseline"), { method: "POST", token, body: {} });
  },
  match(id: string, token: string, partnerId?: string): Promise<Match> {
    return call<Match>(venuePath(id, "/match"), { method: "POST", token, body: partnerId ? { partnerId } : {} });
  },
  async invite(id: string, token: string, planId: string, partnerId: string): Promise<Invite> {
    return absolute(await call<Invite>(venuePath(id, `/nights/${encodeURIComponent(planId)}/invite`), { method: "POST", token, body: { partnerId } }));
  },
  runMonday(id: string, token: string): Promise<{ run: AgentRun; planned: boolean; emailed: boolean; nextAlarm: string | null }> {
    return call(venuePath(id, "/monday/run"), { method: "POST", token, body: {} });
  },
  progress(id: string, token: string): Promise<RunProgress> {
    return call<RunProgress>(venuePath(id, "/progress"), { token });
  },
  async invites(id: string, token: string): Promise<Invite[]> {
    return (await call<Invite[]>(venuePath(id, "/invites"), { token })).map(absolute);
  },
  mcpTools(): Promise<McpTools> {
    return call<McpTools>("/api/mcp/tools");
  },
  async example(): Promise<Example | null> {
    try {
      return parseExample(await call<JointExample>("/api/example"));
    } catch {
      return null;
    }
  },
};
