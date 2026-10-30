import type { Qloo } from "../../core/index.ts";
import type { AgentRun, AgentStep, AgentStepKey } from "../../shared/contract.ts";
import type { VenueDeps } from "./api.ts";
import type { VenueRecords } from "./records.ts";

const KEPT_RUNS = 5;

export interface StepResult {
  did: string;
  outcome: string;
  status?: AgentStep["status"];
}

// Writes down what a run does as it does it. The Qloo calls are counted at the client, so a step's number is what it really made.
export class Tracer {
  readonly steps: AgentStep[] = [];
  readonly startedAt: string;
  private calls = 0;
  private cached = 0;

  constructor(private readonly now: () => Date) {
    this.startedAt = now().toISOString();
  }

  counted(q: Qloo): Qloo {
    return {
      ...q,
      get: async (call, path, params) => {
        const res = await q.get(call, path, params);
        this.calls += 1;
        if (res.prov.cached) this.cached += 1;
        return res;
      },
    };
  }

  withCounts(deps: VenueDeps): VenueDeps {
    return { ...deps, qloo: (established) => { const q = deps.qloo(established); return q ? this.counted(q) : q; } };
  }

  async step<T extends StepResult>(key: AgentStepKey, work: () => Promise<T>): Promise<T> {
    const start = this.now();
    const calls = this.calls;
    const cached = this.cached;
    const result = await work();
    this.steps.push({
      key,
      at: start.toISOString(),
      ms: Math.max(0, this.now().getTime() - start.getTime()),
      did: result.did,
      outcome: result.outcome,
      status: result.status ?? "done",
      calls: this.calls - calls,
      cached: this.cached - cached,
    });
    return result;
  }

  fail(key: AgentStepKey, did: string, outcome: string): void {
    const at = this.now().toISOString();
    this.steps.push({ key, at, ms: 0, did, outcome, status: "failed", calls: 0, cached: 0 });
  }

  finish(id: string, by: AgentRun["by"], plan?: { id: string; title: string }): AgentRun {
    const run: AgentRun = {
      id,
      by,
      startedAt: this.startedAt,
      finishedAt: this.now().toISOString(),
      steps: this.steps,
      calls: this.calls,
      cached: this.cached,
    };
    if (plan) {
      run.planId = plan.id;
      run.title = plan.title;
    }
    return run;
  }
}

export async function runsOf(records: VenueRecords): Promise<AgentRun[]> {
  return (await records.store.get<AgentRun[]>("runs")) ?? [];
}

export async function keepRun(records: VenueRecords, run: AgentRun): Promise<void> {
  await records.store.put("runs", [run, ...(await runsOf(records))].slice(0, KEPT_RUNS));
}
