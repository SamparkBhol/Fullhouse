import type { ScanRecord } from "../../shared/scan.ts";
import type { SqlLike } from "../qloo/caches.ts";

const KEEP = 12;

export interface ScanApi {
  putScan(record: ScanRecord): Promise<void>;
  latestScan(): Promise<ScanRecord | null>;
}

// Scan records live in the stats store's SQLite, one row per scan, newest last. Only totals are ever stored.
export class ScanStore implements ScanApi {
  private ready = false;
  private latest: ScanRecord | null | undefined;

  constructor(private readonly sql: SqlLike) {}

  private table(): void {
    if (this.ready) return;
    this.sql.exec("CREATE TABLE IF NOT EXISTS scan_record (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, body TEXT NOT NULL)");
    this.ready = true;
  }

  async putScan(record: ScanRecord): Promise<void> {
    this.table();
    this.sql.exec("INSERT INTO scan_record (at, body) VALUES (?, ?)", record.at, JSON.stringify(record));
    this.sql.exec("DELETE FROM scan_record WHERE seq <= (SELECT MAX(seq) FROM scan_record) - ?", KEEP);
    this.latest = record;
  }

  async latestScan(): Promise<ScanRecord | null> {
    if (this.latest !== undefined) return this.latest;
    this.table();
    const row = this.sql.exec("SELECT body FROM scan_record ORDER BY seq DESC LIMIT 1").toArray()[0];
    this.latest = row ? (JSON.parse(String(row["body"])) as ScanRecord) : null;
    return this.latest;
  }
}
