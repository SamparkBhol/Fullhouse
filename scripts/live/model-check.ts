import type { ApiError, NightPlan, PlanResponse } from "../../src/shared/contract.ts";

// Asks a running Full House for a plan and says whether its words came from the model or the templates.
//   FULLHOUSE_OWNER_URL="<owner link>" node --no-warnings --experimental-strip-types scripts/live/model-check.ts
// The owner link is the one the app gives when a venue is created: <site>/v/<venue id>#t=<token>.
// The plan uses the venue's stored street read and costs no Qloo calls; a venue with no read yet gets one first,
// which does. Each run is one model call. The token goes only into the Authorization header and is never printed.
// Exit code 0: model copy. 2: template copy. 1: the check could not run.

const TEMPLATE_LINE = "so the copy comes from templates.";

interface Owner {
  site: string;
  venueId: string;
  token: string;
}

function ownerFrom(link: string): Owner {
  const url = new URL(link);
  const venueId = /^\/v\/([^/]+)/.exec(url.pathname)?.[1];
  const token = new URLSearchParams(url.hash.slice(1)).get("t");
  if (!venueId || !token) throw new Error("The owner link needs the /v/<venue id> path and the #t= token");
  return { site: url.origin, venueId, token };
}

async function call<T>(owner: Owner, method: string, path: string, body?: unknown): Promise<{ status: number; data: T | ApiError }> {
  const res = await fetch(`${owner.site}${path}`, {
    method,
    headers: { authorization: `Bearer ${owner.token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(90_000),
  });
  return { status: res.status, data: (await res.json()) as T | ApiError };
}

function isError(data: unknown): data is ApiError {
  return !!data && typeof data === "object" && "error" in data;
}

function describe(plan: NightPlan): string[] {
  const c = plan.copy;
  const why = plan.limits.find((l) => l.endsWith(TEMPLATE_LINE));
  return [
    `Night: ${plan.format}, ${plan.feature?.name ?? "no single feature"}, ${plan.date} ${plan.start}`,
    `Copy written by: ${c.writtenBy}${why ? ` (${why})` : ""}`,
    `Claims checked: ${plan.checks.claimsVerified ? "every name is in the brief" : `not in the brief: ${plan.checks.unverified.join(", ")}`}`,
    `Title: ${c.eventTitle}`,
    `Description: ${c.eventDescription}`,
    `Poster: ${c.posterHeadline} / ${c.posterSub}`,
    `Social: ${c.social}`,
    `Pitch subject: ${c.partnerPitch.subject}`,
    `Pitch body:\n  ${c.partnerPitch.body.split("\n").join("\n  ")}`,
  ];
}

async function main(): Promise<void> {
  const args: string[] = process.argv.slice(2);
  const link = process.env.FULLHOUSE_OWNER_URL ?? args.find((a) => a.startsWith("http")) ?? "";
  if (!link) throw new Error("Set FULLHOUSE_OWNER_URL to the venue's owner link");
  const owner = ownerFrom(link);

  const health = await (await fetch(`${owner.site}/api/health`)).json() as { ai?: boolean; model?: string };
  console.log(`Site: ${owner.site}  model bound: ${health.ai ? "yes" : "no"}  model: ${health.model ?? "unknown"}`);

  const planned = await call<PlanResponse>(owner, "POST", `/api/venues/${owner.venueId}/plan`, {});
  if (isError(planned.data)) throw new Error(`Plan failed (${planned.status}): ${planned.data.error}${planned.data.detail ? `, ${planned.data.detail}` : ""}`);

  const { plan, alternatives } = planned.data;
  console.log(describe(plan).join("\n"));
  console.log(`Alternatives: ${alternatives.map((a) => `${a.format}, ${a.feature?.name ?? "no feature"}, "${a.copy.eventTitle}"`).join(" | ") || "none"}`);
  const fromModel = plan.copy.writtenBy === "model";
  console.log(fromModel ? "Result: the copy came from the model." : "Result: the copy came from the templates.");
  process.exitCode = fromModel ? 0 : 2;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "model check failed");
  process.exitCode = 1;
});
