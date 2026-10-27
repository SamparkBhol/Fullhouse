import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { provenanceParams, type ArrayStyle } from "../../src/core/qloo/request.ts";
import type { Failure, ProbeAnswer } from "./client.ts";
import type { CallGroup, CallSpec } from "./plan.ts";

export interface CallRecord {
  scope: string;
  call: string;
  group: CallGroup;
  question?: string;
  path: string;
  params: Record<string, string>;
  arrays: ArrayStyle;
  status: number;
  ms: number;
  at: string;
  cached: boolean;
  attempts: number;
  retried: number[];
  failure?: Failure;
  body: unknown;
}

export function toRecord(spec: CallSpec, answer: ProbeAnswer): CallRecord {
  const rec: CallRecord = {
    scope: spec.scope,
    call: spec.call,
    group: spec.group,
    path: spec.path,
    params: provenanceParams(spec.params),
    arrays: spec.arrays ?? "comma",
    status: answer.status,
    ms: answer.ms,
    at: answer.at,
    cached: answer.cached,
    attempts: answer.attempts,
    retried: answer.retried,
    body: answer.body,
  };
  if (spec.question) rec.question = spec.question;
  if (answer.failure) rec.failure = answer.failure;
  return rec;
}

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

export async function saveRecord(dir: string, rec: CallRecord): Promise<void> {
  const folder = join(dir, safeName(rec.scope));
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, `${safeName(rec.call)}.json`), JSON.stringify(rec, null, 1));
}

export function requestLine(rec: Pick<CallRecord, "path" | "params">): string {
  const query = Object.entries(rec.params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return query ? `GET ${rec.path}?${query}` : `GET ${rec.path}`;
}
