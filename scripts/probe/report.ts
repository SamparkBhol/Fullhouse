import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { auditSection } from "./audit.ts";
import { COVERAGE_FILE, SHAPES_FILE } from "./config.ts";
import type { ProbeContext } from "./context.ts";
import { citySection, emptySection, latencySection, venueSection } from "./coverage.ts";
import { mapFindings } from "./findings/maps.ts";
import { mediaFindings } from "./findings/media.ts";
import { placeFindings } from "./findings/places.ts";
import { searchFindings } from "./findings/search.ts";
import { tagFindings } from "./findings/tags.ts";
import { trendFindings } from "./findings/trends.ts";
import { shapesOf } from "./shape.ts";

type Section = (ctx: ProbeContext) => string[];

const SECTIONS: Section[] = [
  venueSection,
  citySection,
  searchFindings,
  placeFindings,
  tagFindings,
  mediaFindings,
  mapFindings,
  trendFindings,
  latencySection,
  auditSection,
  emptySection,
];

function header(ctx: ProbeContext): string[] {
  const cached = ctx.records.filter((r) => r.cached).length;
  const retried = ctx.records.filter((r) => r.retried.length).length;
  return [
    "FULL HOUSE LIVE PROBE, COVERAGE",
    "",
    `Run date ${ctx.now.toISOString().slice(0, 10)}. ${ctx.records.length} requests, ${cached} answered from the disk cache, ${retried} needed a retry after HTTP 429 or 5xx.`,
    `Live calls this run ${ctx.calls.thisRun}, all runs ${ctx.calls.ever} of a cap of ${ctx.calls.cap}.`,
    `Venues resolved ${ctx.resolutions.size} of ${ctx.venues.length}. Video game type used ${ctx.gameUrn}. Experiment venues ${ctx.experimentSlugs.join(", ") || "none"}.`,
  ];
}

export async function writeReports(ctx: ProbeContext): Promise<string[]> {
  const parts = [header(ctx), ...SECTIONS.map((section) => section(ctx))];
  const text = parts.map((p) => p.join("\n")).join("\n\n\n");
  await mkdir(dirname(COVERAGE_FILE), { recursive: true });
  await writeFile(COVERAGE_FILE, `${text}\n`);
  await writeFile(SHAPES_FILE, `${JSON.stringify(shapesOf(ctx.records), null, 1)}\n`);
  return [COVERAGE_FILE, SHAPES_FILE];
}
