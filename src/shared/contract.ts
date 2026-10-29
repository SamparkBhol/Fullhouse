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
  hours?: Record<string, OpeningSpan[]>;
  neighborhood?: string;
  // Metres from the search point: the city centre, or the owner's position for a search near them.
  distanceM?: number;
  kind?: string;
}

export interface QuietSlot {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  start: string;
  durationMin: number;
}

export interface CreateVenueInput {
  candidate: VenueCandidate;
  city: string;
  // Only when the owner searched near their own position: used to find the place again, never stored.
  near?: { lat: number; lng: number };
  tz: string;
  quietSlot: QuietSlot;
  capacity?: number;
  ownerEmail?: string;
  noLiveMusic?: boolean;
  assumed?: { slot?: boolean; room?: boolean };
}

// What the owner said about the room: recorded music, a stage with its own programme, a room for a spoken event.
export interface HouseRules {
  music?: boolean;
  stage?: boolean;
  spoken?: boolean;
}

export interface VenueSettingsInput {
  quietSlot?: QuietSlot;
  capacity?: number | null;
  house?: HouseRules;
  contact?: string | null;
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
  house?: HouseRules;
  // The quiet night and room size came from defaults, not the owner, until the owner changes them.
  assumed?: { slot?: boolean; room?: boolean };
  // How a partner reaches the owner after a yes. Shown only to that partner, never on a public page.
  contact?: string;
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
  // For a tag both places share: how many of the places nearby also carry it, out of how many.
  carriers?: number;
  pool?: number;
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
  // The kind in owner words ("cinema"), and whether it is a room a night can run in.
  kind?: string;
  hosts?: boolean;
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
  popularity?: number;
  // On a book: the id of the film made from it, which a book then film night screens after the book club.
  filmOf?: string;
  // On a film: its running time in minutes, so the screening gets the time it needs.
  minutes?: number;
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
  // The venue's own tags that say what its crowd goes for, rarest on the street first, menu and service tags dropped.
  likedFor?: StreetTag[];
  shared: StreetTag[];
  gaps: Gap[];
  lovedPlaces: LovedPlace[];
  rising: Rising[];
  demographics?: Demographics;
  match?: Match;
  limits: string[];
  provenance: Provenance[];
}

export type KindGroup = "book" | "film" | "record" | "live" | "drinks" | "coffee" | "food" | "art" | "stage";

export type FitKey = "crowd" | "back" | "partners" | "open" | "walk" | "taste";

// One part of the fit score, with the plain sentence the app shows for it. Provenance is a row of the read.
export interface FitCheck {
  key: FitKey;
  label: string;
  pass: boolean;
  points: number;
  max: number;
  sentence: string;
  provenance?: number;
}

export interface Fit {
  score: number;
  checks: FitCheck[];
}

// Where the venue sits in the partner's own list of places its crowd loves nearby.
export interface ReverseRank {
  checked: boolean;
  rank: number | null;
  of: number;
}

export interface MatchPartner extends LovedPlace {
  fit?: Fit;
  reverseRank?: ReverseRank;
  group?: KindGroup;
  kind?: string;
  walkMin?: number;
  shared?: StreetTag[];
}

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
  fit?: Fit;
  reverseRank?: ReverseRank;
  venueGroup?: KindGroup;
  venueKind?: string;
}

export type NightHost = "venue" | "partner" | "both";

// Titles both crowds put in their top ten of one kind, for when the two places share few tags.
export interface SharedPicks {
  type: QlooType;
  names: string[];
}

export interface PlanMatch {
  partner: MatchPartner;
  shared: StreetTag[];
  split: CrowdSplit | null;
  host: NightHost;
  sharedPicks?: SharedPicks;
}

export type NightFormat =
  | "listening"
  | "film"
  | "quiz"
  | "book"
  | "games"
  | "podcast"
  | "tasting"
  | "show"
  | "art";

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

export type PairFormat =
  | "book_then_film"
  | "film_then_show"
  | "screening_then_drinks"
  | "book_club_then_drinks"
  | "listening_party"
  | "drinks_then_set"
  | "show_then_drinks"
  | "late_view"
  | "quiz_crawl"
  | "two_stop";

// One of the two places the night moves through, in order, with the walk to the next stop.
export interface NightStop {
  at: "venue" | "partner";
  placeId: string;
  name: string;
  start: string;
  end: string;
  what: string;
  walkMin?: number;
  // The place runs its part after its listed closing time and opens late for it.
  afterHours?: boolean;
}

export interface PairNight {
  format: PairFormat;
  label: string;
  stops: NightStop[];
  picks: Rising[];
  // Why this format for these two kinds of place, in one plain sentence.
  why: string;
  // What ties the picks together, such as the book the film is made from; absent when nothing does.
  link?: string;
  // The stops where the playlist plays: bars, music rooms and cafes in the evening, never a book club or a screening.
  playlistAt?: Array<"venue" | "partner">;
}

export interface NightDay {
  asked: QuietSlot["weekday"];
  moved: boolean;
  note?: string;
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
  day?: NightDay;
  pair?: PairNight;
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

// Who came through whose link: the swap, counted. Only Full House has this, because only it hands out both links.
export interface NightLedger {
  fromVenue: number;
  fromPartner: number;
  direct: number;
}

export interface ShareLinks {
  venue: string;
  partner?: string;
}

// The codes inside the two share links, random so a link never carries a place's name before anyone taps it.
export interface ViaCodes {
  venue: string;
  partner?: string;
}

// Every night with one partner, added up: "You sent 10, they sent 7".
export interface PairLedger {
  partnerId: string;
  partnerName: string;
  nights: number;
  sent: number;
  received: number;
}

export interface Night extends NightPlan {
  actions: ActionResult[];
  eventSlug?: string;
  rsvps: number;
  headcount?: number;
  resultNote?: string;
  withdrawnAt?: string;
  invites?: Invite[];
  ledger?: NightLedger;
  shareLinks?: ShareLinks;
  via?: ViaCodes;
  // A second, short address for the same page, for the poster.
  shortSlug?: string;
  // How many different people reported the public page.
  reports?: number;
}

export type InviteStatus = "waiting" | "accepted" | "declined";

// What the partner typed on its invite page with its yes: its own stop, in its own words and at its own time.
export interface PartnerConfirmation {
  start?: string;
  what?: string;
  tellsRegulars: boolean;
  // The partner says it is open that evening, when its listing has no hours.
  open?: boolean;
  // How the owner reaches the partner. Shown only to the owner, never on a public page.
  contact?: string;
  at: string;
}

export interface Invite {
  id: string;
  slug: string;
  url: string;
  planId: string;
  partner: EntityRef;
  status: InviteStatus;
  createdAt: string;
  answeredAt?: string;
  confirmed?: PartnerConfirmation;
}

export interface InviteInput {
  partnerId: string;
}

export interface InviteAnswer {
  answer: "yes" | "no";
  start?: string;
  what?: string;
  tellsRegulars?: boolean;
  open?: boolean;
  contact?: string;
}

export interface ExamplePlace {
  name: string;
  image?: string;
  kind?: string;
  address?: string;
  neighborhood?: string;
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
  // When the stored read behind the example was taken, so the landing can say how old it is.
  readAt?: string;
  kind?: string;
  fit?: number;
  // The checks behind the fit score, so the landing shows the same reasons the owner sees.
  checks?: FitCheck[];
  city?: string;
  date?: string;
  stops?: Array<{ name: string; start: string; end: string; what: string; walkMin?: number }>;
  // True only when the partner said yes on its invite; otherwise the pair is proposed, not agreed.
  agreed?: boolean;
}

export interface VenueState {
  venue: Venue;
  read?: StreetRead;
  proposals: NightPlan[];
  nights: Night[];
  nextAlarm?: string;
  baseline?: Baseline;
  ledgers?: PairLedger[];
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

// Which Qloo calls have finished in the read or plan now running.
export interface RunProgress {
  since: string | null;
  done: string[];
}

export interface ApiError {
  error: string;
  detail?: string;
}
