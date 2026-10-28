export interface LoggedRequest {
  at: string;
  method: string;
  path: string;
  query: Record<string, string>;
  keyHeader: "present" | "missing";
  keyAccepted: boolean;
  status: number;
}

// The key itself is never logged; the tests only need to know it was sent and matched.
export class RequestLog {
  private readonly entries: LoggedRequest[] = [];

  add(entry: LoggedRequest): void {
    this.entries.push(entry);
  }

  list(): LoggedRequest[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
