export type QlooType =
  | "place"
  | "artist"
  | "book"
  | "movie"
  | "tv_show"
  | "podcast"
  | "videogame"
  | "brand"
  | "person"
  | "destination";

export interface EntityRef {
  id: string;
  name: string;
  type: QlooType;
  subtype?: string;
  image?: string;
  url?: string;
}

export interface Provenance {
  call: string;
  endpoint: string;
  params: Record<string, string>;
  at: string;
  resultCount: number;
  cached: boolean;
  ms?: number;
}

export type BecauseKind =
  | "heatmap"
  | "tag"
  | "compare"
  | "trending"
  | "explainability"
  | "affinity"
  | "demographics"
  | "owner";

export interface Because {
  text: string;
  kind: BecauseKind;
  provenance: number;
}

export interface VenueCandidate extends EntityRef {
  address?: string;
  lat: number;
  lng: number;
  tags: string[];
}

export interface QuietSlot {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  start: string;
  durationMin: number;
}

export interface CreateVenueInput {
  candidate: VenueCandidate;
  city: string;
  tz: string;
  quietSlot: QuietSlot;
  capacity?: number;
  ownerEmail?: string;
  noLiveMusic?: boolean;
}

export interface Venue {
  id: string;
  entity: VenueCandidate;
  city: string;
  tz: string;
  quietSlot: QuietSlot;
  capacity?: number;
  ownerEmail?: string;
  noLiveMusic?: boolean;
  createdAt: string;
  eventbrite?: { organization: string };
  verified?: boolean;
  pendingEmail?: string;
}

export interface HeatCell {
  geohash: string;
  lat: number;
  lng: number;
  affinityRank: number;
  popularity: number;
  noRead?: true;
}

export interface HeatLayer {
  label: string;
  cells: HeatCell[];
  provenance: number;
}

export interface StreetTag {
  id: string;
  name: string;
  namespace: string;
  rank: number;
}

export interface OpeningSpan {
  opens?: string;
  closes?: string;
  closed?: boolean;
}

export interface LovedPlace extends EntityRef {
  lat: number;
  lng: number;
  address?: string;
  distanceM: number;
  rank: number;
  tags: string[];
  because: Because[];
  hours?: Record<string, OpeningSpan[]>;
}

export type Trend = "rising" | "steady" | "falling" | "unknown";

export interface Rising extends EntityRef {
  rank: number;
  trend: Trend;
  trendNote?: string;
  because: Because[];
  tags?: string[];
  venueSignal?: boolean;
  explain?: { entityId: string; share: number }[];
  by?: string;
}

export interface Gap {
  tag: StreetTag;
  note: string;
  because: Because[];
}

export interface Demographics {
  summary: string;
  provenance: number;
}

export interface StreetRead {
  venueId: string;
  at: string;
  center: { lat: number; lng: number };
  radiusM: number;
  heat: HeatLayer[];
  streetTags: StreetTag[];
  venueTags: StreetTag[];
  shared: StreetTag[];
  gaps: Gap[];
  lovedPlaces: LovedPlace[];
  rising: Rising[];
  demographics?: Demographics;
  match?: Match;
  limits: string[];
  provenance: Provenance[];
}

export interface MatchPartner extends LovedPlace {}

export interface CrowdSplit {
  venue: number;
  partner: number;
}

export interface Match {
  partner: MatchPartner;
  runnersUp: MatchPartner[];
  shared: StreetTag[];
  readAt: string;
  provenance: number[];
}

export type NightHost = "venue" | "partner" | "both";

export interface PlanMatch {
  partner: MatchPartner;
  shared: StreetTag[];
  split: CrowdSplit | null;
  host: NightHost;
}

export type NightFormat =
  | "listening"
  | "film"
  | "quiz"
  | "book"
  | "games"
  | "podcast"
  | "tasting";

export interface PlanInput {
  weekday?: QuietSlot["weekday"];
  start?: string;
  durationMin?: number;
  maxPeople?: number;
  avoidFormats?: NightFormat[];
  preferFormats?: NightFormat[];
  noLiveMusic?: boolean;
  note?: string;
}

export interface MenuIdea {
  text: string;
  because: Because[];
}

export interface NightCopy {
  eventTitle: string;
  eventDescription: string;
  posterHeadline: string;
  posterSub: string;
  social: string;
  partnerPitch: { subject: string; body: string };
  writtenBy: "model" | "template";
  editedByOwner?: boolean;
}

export interface NightPlan {
  id: string;
  venueId: string;
  createdAt: string;
  origin: "owner" | "monday" | "refine";
  date: string;
  start: string;
  end: string;
  format: NightFormat;
  feature: Rising | null;
  themeTags: StreetTag[];
  partners: LovedPlace[];
  menuIdeas: MenuIdea[];
  playlist: EntityRef[];
  why: Because[];
  copy: NightCopy;
  checks: { claimsVerified: boolean; unverified: string[] };
  limits: string[];
  readAt: string;
  status: "proposed" | "approved" | "done" | "skipped";
  maxPeople?: number;
  match?: PlanMatch;
}

export interface PlanResponse {
  plan: NightPlan;
  alternatives: NightPlan[];
  input?: PlanInput;
  refine?: { method: "tool" | "json" | "keywords"; request: string };
}

export type ActionKind =
  | "event_page"
  | "poster"
  | "ics"
  | "gcal"
  | "outreach"
  | "eventbrite"
  | "owner_email";

export type EditableCopy = Partial<Pick<NightCopy, "eventTitle" | "eventDescription" | "posterHeadline" | "posterSub">>;

export interface ApproveInput {
  actions: ActionKind[];
  partnerEmails?: Record<string, string>;
  copy?: EditableCopy;
}

export interface ActionResult {
  kind: ActionKind;
  ok: boolean;
  url?: string;
  label: string;
  detail: string;
  links?: { label: string; url: string }[];
}

export interface Night extends NightPlan {
  actions: ActionResult[];
  eventSlug?: string;
  rsvps: number;
  headcount?: number;
  resultNote?: string;
  withdrawnAt?: string;
  invites?: Invite[];
}

export type InviteStatus = "waiting" | "accepted" | "declined";

export interface Invite {
  id: string;
  slug: string;
  url: string;
  planId: string;
  partner: EntityRef;
  status: InviteStatus;
  createdAt: string;
  answeredAt?: string;
}

export interface InviteInput {
  partnerId: string;
}

export interface InviteAnswer {
  answer: "yes" | "no";
}

export interface ExamplePlace {
  name: string;
  image?: string;
}

export interface JointExample {
  venue: ExamplePlace;
  partner: ExamplePlace;
  distanceM: number;
  minutes: number;
  title: string;
  format: NightFormat;
  feature?: string;
  split: CrowdSplit | null;
  shared: string[];
}

export interface VenueState {
  venue: Venue;
  read?: StreetRead;
  proposals: NightPlan[];
  nights: Night[];
  nextAlarm?: string;
  baseline?: Baseline;
}

export type VerifyStatus = "found_nearby" | "found_far" | "not_found";

export interface BaselineName {
  name: string;
  kind: "place" | "artist" | "other";
  status: VerifyStatus;
  note?: string;
  closed?: true;
  tied?: boolean;
  tieNote?: string;
}

export interface Baseline {
  at: string;
  ask: string;
  model: string;
  plainText: string;
  plainNames: BaselineName[];
  fullHouseNames: BaselineName[];
  method: string;
  modelLabel?: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
