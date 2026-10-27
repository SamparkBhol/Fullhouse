import { isObj, list, obj, str } from "./values.ts";

export type QlooErrorKind = "auth" | "rate" | "bad_request" | "not_found" | "server" | "budget" | "network" | "timeout";

export class QlooError extends Error {
  status: number;
  kind: QlooErrorKind;
  call?: string;

  constructor(kind: QlooErrorKind, status: number, message: string, call?: string) {
    super(message);
    this.name = "QlooError";
    this.kind = kind;
    this.status = status;
    if (call !== undefined) this.call = call;
  }
}

// Insights and trending answer {errors: [{message, path}]}; /search and auth failures answer {error: {message, reason}}.
export function errorMessage(body: unknown): string {
  if (!isObj(body)) return "";
  const listed = list(body.errors).flatMap((e) => {
    const message = str(obj(e).message);
    const path = str(obj(e).path);
    return message ? [path && !message.includes(path) ? `${message} (${path})` : message] : [];
  });
  if (listed.length) return listed.join("; ").slice(0, 300);
  const inner = obj(body.error);
  return [str(inner.message), str(inner.reason)].filter((s) => s !== undefined).join(": ").slice(0, 300);
}

// Unsupported entity types come back as 400 on the hackathon host, not the 403 the guide describes.
export function classify(status: number): QlooErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  return "bad_request";
}
