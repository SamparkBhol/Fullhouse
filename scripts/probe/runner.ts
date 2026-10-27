import type { ProbeClient } from "./client.ts";
import type { CallSpec } from "./plan.ts";
import { saveRecord, toRecord, type CallRecord } from "./record.ts";

export function createRunner(client: ProbeClient, recordDir: string) {
  const done: Array<{ seq: number; rec: CallRecord }> = [];
  let next = 0;

  async function run(spec: CallSpec): Promise<CallRecord> {
    const seq = next++;
    const answer = await client.get(spec.path, spec.params, spec.arrays);
    const rec = toRecord(spec, answer);
    done.push({ seq, rec });
    await saveRecord(recordDir, rec);
    return rec;
  }

  // Answers arrive in completion order; reports read them in the order the plan asked.
  const records = () => [...done].sort((a, b) => a.seq - b.seq).map((d) => d.rec);

  return {
    records,
    run,
    runAll: (specs: CallSpec[]) => Promise.all(specs.map(run)),
    byScope: (scope: string) => new Map(records().filter((r) => r.scope === scope).map((r) => [r.call, r])),
  };
}

export type Runner = ReturnType<typeof createRunner>;
