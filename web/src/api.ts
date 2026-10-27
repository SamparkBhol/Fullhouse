import type {
  ApiError,
  ApproveInput,
  Baseline,
  CreateVenueInput,
  Night,
  NightPlan,
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

function pickArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const key of keys) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

export interface CreatedVenue {
  venue: Venue;
  ownerToken: string;
  ownerUrl: string;
}

export function isPlanResponse(value: unknown): value is PlanResponse {
  return !!value && typeof value === "object" && "plan" in value;
}

function asPlanResponse(value: unknown): PlanResponse {
  if (isPlanResponse(value)) {
    return { plan: value.plan, alternatives: Array.isArray(value.alternatives) ? value.alternatives : [] };
  }
  return { plan: value as NightPlan, alternatives: [] };
}

export const api = {
  async search(name: string, city: string): Promise<VenueCandidate[]> {
    const data = await call<unknown>("/api/venues/search", { method: "POST", body: { name, city } });
    return pickArray<VenueCandidate>(data, ["candidates", "results"]);
  },
  create(input: CreateVenueInput): Promise<CreatedVenue> {
    return call<CreatedVenue>("/api/venues", { method: "POST", body: input });
  },
  state(id: string, token: string): Promise<VenueState> {
    return call<VenueState>(`/api/venues/${encodeURIComponent(id)}`, { token });
  },
  read(id: string, token: string): Promise<StreetRead> {
    return call<StreetRead>(`/api/venues/${encodeURIComponent(id)}/read`, { method: "POST", token, body: {} });
  },
  async plan(id: string, token: string, input: PlanInput): Promise<PlanResponse> {
    return asPlanResponse(await call<unknown>(`/api/venues/${encodeURIComponent(id)}/plan`, { method: "POST", token, body: input }));
  },
  async refine(id: string, token: string, planId: string, request: string): Promise<PlanResponse> {
    return asPlanResponse(
      await call<unknown>(`/api/venues/${encodeURIComponent(id)}/refine`, { method: "POST", token, body: { planId, request } }),
    );
  },
  approve(id: string, token: string, planId: string, input: ApproveInput): Promise<Night> {
    return call<Night>(`/api/venues/${encodeURIComponent(id)}/nights/${encodeURIComponent(planId)}/approve`, {
      method: "POST",
      token,
      body: input,
    });
  },
  result(id: string, token: string, nightId: string, headcount: number, note?: string): Promise<unknown> {
    return call<unknown>(`/api/venues/${encodeURIComponent(id)}/nights/${encodeURIComponent(nightId)}/result`, {
      method: "POST",
      token,
      body: note ? { headcount, note } : { headcount },
    });
  },
  async eventbrite(id: string, token: string, privateToken: string): Promise<string | null> {
    const data = await call<unknown>(`/api/venues/${encodeURIComponent(id)}/eventbrite`, {
      method: "POST",
      token,
      body: { token: privateToken },
    });
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const org = record.organization ?? record.name;
      if (typeof org === "string") return org;
      if (org && typeof org === "object" && typeof (org as Record<string, unknown>).name === "string") {
        return (org as Record<string, string>).name ?? null;
      }
    }
    return null;
  },
  remove(id: string, token: string): Promise<unknown> {
    return call<unknown>(`/api/venues/${encodeURIComponent(id)}`, { method: "DELETE", token });
  },
  baseline(id: string, token: string): Promise<Baseline> {
    return call<Baseline>(`/api/venues/${encodeURIComponent(id)}/baseline`, { method: "POST", token, body: {} });
  },
};

export interface Explained {
  title: string;
  body: string;
  retry: boolean;
}

export function explain(err: unknown): Explained {
  if (!(err instanceof ApiFailure)) {
    return { title: "Something broke on this page", body: "Reload the page and try again.", retry: true };
  }
  const code = err.code.toLowerCase();
  if (err.network) {
    return {
      title: "Full House is out of reach",
      body: "This phone could not reach the Full House server. Check the connection, then try again.",
      retry: true,
    };
  }
  if (code === "qloo_key_missing") {
    return {
      title: "No Qloo key on this server",
      body: "This Full House server has no Qloo key set, so it cannot read the street. Nothing was read and nothing was made up. Whoever runs this server needs to add the key. Then try again.",
      retry: true,
    };
  }
  if (code.includes("budget")) {
    return {
      title: "Today's Qloo budget is spent",
      body: "This server has used all the Qloo calls it allows itself in a day, so it makes no new ones until the daily budget resets. Your saved read and your nights are still here.",
      retry: false,
    };
  }
  if (err.status === 429 || code.includes("rate") || code.includes("too_many")) {
    return {
      title: "Too many requests from this connection",
      body: "Wait a minute, then try again.",
      retry: true,
    };
  }
  if (err.status === 401 || err.status === 403) {
    return {
      title: "This phone is not signed in to this venue",
      body: "Open the owner link you saved when you created the venue. It signs this phone in.",
      retry: false,
    };
  }
  if (err.status === 404) {
    return {
      title: "Not found",
      body: "This venue or night does not exist anymore, or the link is incomplete.",
      retry: false,
    };
  }
  if (code.includes("qloo")) {
    return {
      title: "Qloo did not answer",
      body: err.detail ?? "The Qloo call failed. Nothing was filled in instead. Try again in a minute.",
      retry: true,
    };
  }
  return {
    title: "The server could not do that",
    body: err.detail ?? `It answered with ${err.code}. Try again.`,
    retry: true,
  };
}
