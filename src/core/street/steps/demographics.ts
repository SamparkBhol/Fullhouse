import type { Demographics } from "../../../shared/contract.ts";
import { listWords, possessive } from "../../../shared/words.ts";
import { parseDemographics, type QDemo } from "../../qloo/demographics.ts";
import type { Runner } from "../runner.ts";
import type { ReadContext } from "./resolve.ts";

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "24 and younger",
  "25_to_29": "25 to 29",
  "30_to_34": "30 to 34",
  "35_to_44": "35 to 44",
  "45_to_54": "45 to 54",
  "55_and_older": "55 and older",
};

const LEAN = 0.05;

export function summariseDemographics(blocks: QDemo[], name: string): string | null {
  const block = blocks[0];
  if (!block) return null;
  const lean = Object.entries(block.age)
    .filter(([, v]) => v >= LEAN)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => AGE_LABEL[k] ?? k.replace(/_/g, " "));
  const male = block.gender.male ?? (block.gender.female !== undefined ? -block.gender.female : 0);
  const gender = Math.abs(male) >= LEAN ? `, leaning ${male > 0 ? "male" : "female"}` : "";
  const ages = lean.length ? `the ${listWords(lean)} age ${lean.length === 1 ? "group" : "groups"}` : "no single age group";
  return `People who like ${name} on Qloo over index on ${ages}${gender}. This is Qloo's aggregate for the venue's audience, not a description of the street's residents or of any person.`;
}

// Demographics ignore location: the same input gives the same answer in every city, so the venue is the signal.
export async function demographicsStep(run: Runner, ctx: ReadContext): Promise<{ demographics: Demographics | null; limits: string[] }> {
  const params = { "filter.type": "urn:demographics", "signal.interests.entities": ctx.entityId };
  const got = await run.call("demographics", "/v2/insights", params, "Audience demographics");
  if (!got) return { demographics: null, limits: [] };
  const summary = summariseDemographics(parseDemographics(got.body), ctx.name);
  if (!summary) return { demographics: null, limits: [`Qloo returned no age or gender lean for ${possessive(ctx.name)} audience.`] };
  return { demographics: { summary, provenance: got.ref }, limits: [] };
}
