import type { LoggedRequest } from "../fake-qloo/log.ts";
import { FAKE_QLOO_URL } from "./env.ts";

export async function fakeQlooLog(): Promise<LoggedRequest[]> {
  const res = await fetch(`${FAKE_QLOO_URL}/__fake/log`);
  if (!res.ok) throw new Error(`the fake Qloo log answered ${res.status}`);
  const body = (await res.json()) as { requests: LoggedRequest[] };
  return body.requests;
}
