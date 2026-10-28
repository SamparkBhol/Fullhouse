import type { NightPlan, PlanInput, PlanResponse, StreetRead, Venue, Night } from "../../shared/contract.ts";
import type { Published } from "../actions/run.ts";
import type { Sealed } from "../crypto.ts";
import type { Counted } from "../stats/makers.ts";
import type { Store } from "../store.ts";

export interface ProposalRecord {
  plan: NightPlan;
  input: PlanInput;
}

export interface NightRecord {
  night: Night;
  input: PlanInput;
  published: Published;
  // What the owner chose to publish, so a page taken down after reports can go back up as it was.
  chosen?: Published;
  reports?: number;
  // What the public totals hold for this night, so a correction moves them by the difference.
  counted?: Counted;
}

export interface EventbriteRecord {
  sealed: Sealed;
  organizationId: string;
  organization: string;
}

export interface EmailCode {
  email: string;
  code: string;
  at: string;
}

const MAX_PROPOSALS = 12;
const MAILS_PER_DAY = 3;

// Typed access to the keys one venue keeps in its Durable Object storage.
export class VenueRecords {
  constructor(readonly store: Store) {}

  venue(): Promise<Venue | undefined> {
    return this.store.get<Venue>("venue");
  }

  read(): Promise<StreetRead | undefined> {
    return this.store.get<StreetRead>("read");
  }

  async authNonce(): Promise<string> {
    return (await this.store.get<string>("auth")) ?? "";
  }

  async origin(): Promise<string | undefined> {
    return (await this.store.get<{ origin: string }>("meta"))?.origin;
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

  // A refined plan replaces the plans it was refined from, so home never offers the old draft next to it.
  async saveProposals(response: PlanResponse, input: PlanInput, replaces?: string): Promise<void> {
    const fresh = [response.plan, ...response.alternatives].map((plan) => ({ plan, input }));
    const old = (await this.proposals()).filter((r) => r.plan.status === "proposed" && r.plan.createdAt !== replaces);
    await this.store.put("proposals", [...fresh, ...old].slice(0, MAX_PROPOSALS));
  }

  async nightBySlug(slug: string): Promise<{ venue: Venue; rec: NightRecord } | null> {
    const id = await this.store.get<string>(`slug:${slug}`);
    if (!id) return null;
    const [venue, rec] = await Promise.all([this.venue(), this.night(id)]);
    return venue && rec ? { venue, rec } : null;
  }

  // Every mail the app sends counts, so a typo in an address can never turn it into a mailer.
  async takeMailSlot(day: string): Promise<boolean> {
    const key = `mail:${day}`;
    const sent = (await this.store.get<number>(key)) ?? 0;
    if (sent >= MAILS_PER_DAY) return false;
    await this.store.put(key, sent + 1);
    return true;
  }
}
