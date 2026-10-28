import type { NightFormat, NightPlan } from "./contract.ts";

export type StatsRange = "24h" | "7d" | "30d";

export const STATS_RANGES: readonly StatsRange[] = ["24h", "7d", "30d"];

export const RANGE_WORDS: Record<StatsRange, string> = { "24h": "the last 24 hours", "7d": "the last 7 days", "30d": "the last 30 days" };

// How old an answer may be. Longer ranges change less from one minute to the next, so they are kept longer.
export const STATS_MAX_AGE_S: Record<StatsRange, number> = { "24h": 10, "7d": 60, "30d": 300 };

// Head counts and seats are public only once this many nights are logged in a range, so no one venue's night can be read off /live.
export const TURNOUT_SHOWN_FROM = 5;

// Qloo failure kinds in plain words, shared by the log lines, /live.txt and the /live page.
export const ERROR_WORDS: Record<string, string> = {
  auth: "the key was refused",
  rate: "rate limited",
  bad_request: "bad request",
  not_found: "not found",
  server: "Qloo server error",
  budget: "stopped by today's budget",
  network: "network error",
  timeout: "no answer in time",
  other: "unknown error",
};

export type StatEventKind =
  | "venue_created"
  | "street_read"
  | "plan_made"
  | "night_published"
  | "rsvp"
  | "turnout"
  | "monday_run"
  | "mcp_call"
  | "qloo_error";

// Turnout figures are null until TURNOUT_SHOWN_FROM nights are logged in the range.
export interface StatsCounts {
  venues: number;
  streetReads: number;
  plans: number;
  nightsPublished: number;
  rsvps: number;
  turnoutNights: number;
  turnoutPeople: number | null;
  roomNights: number | null;
  roomSeats: number | null;
  roomPeople: number | null;
  mondayRuns: number;
  mondayPlanned: number;
  mcpCalls: number;
  copyModel: number;
  copyTemplate: number;
  qlooCalls: number;
  qlooCacheHits: number;
  qlooErrors: number;
}

export type SeriesName = "venues" | "streetReads" | "nightsPublished" | "rsvps" | "qlooCalls" | "qlooCacheHits" | "qlooErrors";

export type StatsSeries = Record<SeriesName, number[]>;

export interface EndpointStats {
  endpoint: string;
  calls: number;
  cacheHits: number;
  errors: number;
  p50: number | null;
  p95: number | null;
  samples: number;
}

export interface LoggedEvent {
  at: string;
  kind: StatEventKind;
  line: string;
}

export interface BudgetToday {
  day: string;
  counted: number;
  budget: number;
  newVenueShare: number;
  resetsAt: string;
  liveCalls: number;
}

export interface StatsBody {
  range: StatsRange;
  since: string | null;
  bucketHours: number;
  buckets: string[];
  totals: StatsCounts;
  allTime: Pick<StatsCounts, "venues" | "streetReads" | "nightsPublished" | "rsvps" | "turnoutNights" | "turnoutPeople">;
  series: StatsSeries;
  endpoints: EndpointStats[];
  errorKinds: { kind: string; n: number }[];
  mcpTools: { tool: string; n: number }[];
  budget: BudgetToday;
  events: LoggedEvent[];
}

export interface DashboardNight {
  id: string;
  date: string;
  start: string;
  end: string;
  format: NightFormat;
  title: string;
  feature?: string;
  status: NightPlan["status"];
  origin: NightPlan["origin"];
  rsvps: number;
  headcount?: number;
  room?: number;
  withdrawn: boolean;
  public: boolean;
}

export interface DashboardRead {
  at: string;
  calls: number;
  cached: number;
}

export interface MondayProposal {
  id: string;
  date: string;
  start: string;
  format: NightFormat;
  title: string;
  feature?: string;
}

export interface DashboardMonday {
  at: string;
  planned: boolean;
  proposal?: MondayProposal & { published: boolean };
}

export interface DashboardNext {
  nightId: string;
  date: string;
  start: string;
  title: string;
  rsvps: number;
  room?: number;
}

export interface VenueDashboard {
  venueId: string;
  tz: string;
  capacity?: number;
  nights: DashboardNight[];
  reads: DashboardRead[];
  mondays: DashboardMonday[];
  next: DashboardNext | null;
  nextAlarm?: string;
}
