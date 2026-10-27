import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface Ledger {
  reserve(): boolean;
  spentThisRun(): number;
  spentEver(): number;
  cap: number;
  flush(): Promise<void>;
}

async function readTotal(file: string): Promise<number> {
  try {
    const saved = JSON.parse(await readFile(file, "utf8")) as { liveCalls?: unknown };
    return typeof saved.liveCalls === "number" ? saved.liveCalls : 0;
  } catch {
    return 0;
  }
}

// The count lives on disk so the cap holds across reruns, not just within one process.
export async function openLedger(file: string, cap: number): Promise<Ledger> {
  const before = await readTotal(file);
  let total = before;
  let writing: Promise<void> = Promise.resolve();

  const persist = () => {
    const snapshot = total;
    writing = writing.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ liveCalls: snapshot, updated: new Date().toISOString() }));
    });
  };

  return {
    cap,
    reserve() {
      if (total >= cap) return false;
      total += 1;
      persist();
      return true;
    },
    spentThisRun: () => total - before,
    spentEver: () => total,
    flush: () => writing,
  };
}
