import type { NightPlan, PlanInput, PlanResponse, StreetRead, Venue, Night } from "../../shared/contract.ts";
import type { Published } from "../actions/run.ts";
import type { Store } from "../store.ts";
import type { Sealed } from "../tokens.ts";

export interface ProposalRecord {
  plan: NightPlan;
  input: PlanInput;
}

export interface NightRecord {
  night: Night;
  input: PlanInput;
  published: Published;
}

export interface EventbriteRecord {
  sealed: Sealed;
  organizationId: string;
  organization: string;
}

const MAX_PROPOSALS = 12;

// Typed access to the keys one venue keeps in its Durable Object storage.
export class VenueRecords {
  constructor(readonly store: Store) {}

  venue(): Promise<Venue | undefined> {
    return this.store.get<Venue>("venue");
  }

  read(): Promise<StreetRead | undefined> {
    return this.store.get<StreetRead>("read");
  }

  async proposals(): Promise<ProposalRecord[]> {
    return (await this.store.get<ProposalRecord[]>("proposals")) ?? [];
  }

  async nights(): Promise<NightRecord[]> {
    return [...(await this.store.list<NightRecord>("night:")).values()];
  }

  night(id: string): Promise<NightRecord | undefined> {
    return this.store.get<NightRecord>(`night:${id}`);
  }

  async saveProposals(response: PlanResponse, input: PlanInput): Promise<void> {
    const fresh = [response.plan, ...response.alternatives].map((plan) => ({ plan, input }));
    const old = (await this.proposals()).filter((r) => r.plan.status === "proposed");
    await this.store.put("proposals", [...fresh, ...old].slice(0, MAX_PROPOSALS));
  }

  async nightBySlug(slug: string): Promise<{ venue: Venue; rec: NightRecord } | null> {
    const id = await this.store.get<string>(`slug:${slug}`);
    if (!id) return null;
    const [venue, rec] = await Promise.all([this.venue(), this.night(id)]);
    return venue && rec ? { venue, rec } : null;
  }
}
