import type { Invite, Match, Night, NightPlan, PlanInput, PlanResponse, Rising, StreetRead, Venue } from "../../shared/contract.ts";
import type { Published } from "../actions/run.ts";
import type { Sealed } from "../crypto.ts";
import type { Counted } from "../stats/makers.ts";
import type { Store } from "../store.ts";
import { withBoard } from "../../core/pair/board.ts";

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
  // One hashed key per person who reported the page, so one person pressing three times is one report.
  reporters?: string[];
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

// The joint read for one partner and one street read, kept so changing the day does not ask Qloo again.
export interface JointRecord {
  readAt: string;
  partnerId: string;
  rising: Rising[];
  limits: string[];
}

const MAX_PROPOSALS = 12;
const MAILS_PER_DAY = 3;

// Typed access to the keys one venue keeps in its Durable Object storage.
export class VenueRecords {
  constructor(readonly store: Store) {}

  venue(): Promise<Venue | undefined> {
    return this.store.get<Venue>("venue");
  }

  // A read stored before the board existed gets one built from its own list, with no call to Qloo.
  async read(): Promise<StreetRead | undefined> {
    const read = await this.store.get<StreetRead>("read");
    if (!read?.match || read.match.considered) return read;
    const venue = await this.venue();
    return venue ? { ...read, match: withBoard(read.match, venue, read.lovedPlaces) } : read;
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

  // The owner's choice of partner holds for the read it was made on; a fresh read starts from its own top candidate.
  async match(): Promise<Match | undefined> {
    const [read, chosen] = await Promise.all([this.read(), this.store.get<Match>("match")]);
    if (!read) return undefined;
    if (!chosen || chosen.readAt !== read.at) return read.match;
    if (chosen.considered || !read.match) return chosen;
    const venue = await this.venue();
    return venue ? withBoard(chosen, venue, read.lovedPlaces, read.match.partner) : chosen;
  }

  async joint(readAt: string, partnerId: string): Promise<JointRecord | undefined> {
    const j = await this.store.get<JointRecord>("joint");
    return j && j.readAt === readAt && j.partnerId.toUpperCase() === partnerId.toUpperCase() ? j : undefined;
  }

  async invites(): Promise<Invite[]> {
    return [...(await this.store.list<Invite>("invite:")).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async invitesFor(planId: string): Promise<Invite[]> {
    return (await this.invites()).filter((i) => i.planId === planId);
  }

  async accepted(planId: string): Promise<Invite | undefined> {
    return (await this.invitesFor(planId)).find((i) => i.status === "accepted");
  }

  async inviteBySlug(slug: string): Promise<Invite | undefined> {
    const id = await this.store.get<string>(`islug:${slug}`);
    return id ? this.store.get<Invite>(`invite:${id}`) : undefined;
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
