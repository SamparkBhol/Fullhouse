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
}

export interface HeatCell {
  geohash: string;
  lat: number;
  lng: number;
  affinityRank: number;
  popularity: number;
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

export interface LovedPlace extends EntityRef {
  lat: number;
  lng: number;
  address?: string;
  distanceM: number;
  rank: number;
  tags: string[];
  because: Because[];
}

export type Trend = "rising" | "steady" | "falling" | "unknown";

export interface Rising extends EntityRef {
  rank: number;
  trend: Trend;
  trendNote?: string;
  because: Because[];
  tags?: string[];
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
  limits: string[];
  provenance: Provenance[];
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
}

export interface PlanResponse {
  plan: NightPlan;
  alternatives: NightPlan[];
}

export type ActionKind =
  | "event_page"
  | "poster"
  | "ics"
  | "gcal"
  | "outreach"
  | "eventbrite"
  | "owner_email";

export interface ApproveInput {
  actions: ActionKind[];
  partnerEmails?: Record<string, string>;
}

export interface ActionResult {
  kind: ActionKind;
  ok: boolean;
  url?: string;
  label: string;
  detail: string;
}

export interface Night extends NightPlan {
  actions: ActionResult[];
  eventSlug?: string;
  rsvps: number;
  headcount?: number;
  resultNote?: string;
}

export interface VenueState {
  venue: Venue;
  read?: StreetRead;
  proposals: NightPlan[];
  nights: Night[];
  nextAlarm?: string;
}

export type VerifyStatus = "found_nearby" | "found_far" | "not_found";

export interface BaselineName {
  name: string;
  kind: "place" | "artist" | "other";
  status: VerifyStatus;
  note?: string;
}

export interface Baseline {
  at: string;
  ask: string;
  model: string;
  plainText: string;
  plainNames: BaselineName[];
  fullHouseNames: BaselineName[];
  method: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
