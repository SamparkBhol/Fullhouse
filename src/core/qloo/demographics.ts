import { resultRows } from "./results.ts";
import { num, obj, str } from "./values.ts";

export interface QDemo {
  input: string;
  age: Record<string, number>;
  gender: Record<string, number>;
}

function numbers(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(raw))) {
    const n = num(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

// One block per input that has data; values are signed deviations from Qloo's baseline.
export function parseDemographics(body: unknown): QDemo[] {
  const out: QDemo[] = [];
  for (const row of resultRows(body, "demographics")) {
    const q = obj(obj(row).query);
    const age = numbers(q.age);
    const gender = numbers(q.gender);
    if (Object.keys(age).length || Object.keys(gender).length) out.push({ input: str(obj(row).entity_id) ?? "", age, gender });
  }
  return out;
}
