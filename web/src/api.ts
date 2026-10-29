import type {
  ApiError,
  ApproveInput,
  Baseline,
  CreateVenueInput,
  Night,
  PlanInput,
  PlanResponse,
  StreetRead,
  Venue,
  VenueCandidate,
  VenueState,
} from "../../src/shared/contract.ts";

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

const venuePath = (id: string, rest = "") => `/api/venues/${encodeURIComponent(id)}${rest}`;

export const api = {
  // Asked once per page load: whether this server can send email decides what the owner is offered.
  health(): Promise<Health> {
    health ??= call<Health>("/api/health").catch(() => ({ qloo: true, ai: false, ownerEmail: false }));
    return health;
  },
  search(name: string, city: string): Promise<VenueCandidate[]> {
    return call<VenueCandidate[]>("/api/venues/search", { method: "POST", body: { name, city } });
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
};
