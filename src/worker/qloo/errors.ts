export const QLOO_KEY_MISSING = {
  status: 503,
  error: "qloo_key_missing",
  detail: "The Qloo API key is not set on this server, so no taste data can be fetched. Nothing is shown in its place.",
} as const;

export interface QlooErrorLike {
  status: number;
  kind: string;
  message: string;
}

export function isQlooError(err: unknown): err is QlooErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { kind?: unknown }).kind === "string" &&
    typeof (err as { status?: unknown }).status === "number"
  );
}

export function qlooFailure(err: QlooErrorLike): { status: number; error: string; detail: string } {
  switch (err.kind) {
    case "budget":
      return { status: 503, error: "qloo_budget_spent", detail: "Today's Qloo call budget is spent. It resets at midnight UTC." };
    case "auth":
      return { status: 502, error: "qloo_auth", detail: "The taste data service refused the API key. The server owner needs to check it." };
    case "rate":
      return { status: 503, error: "qloo_rate_limited", detail: "The taste data service asked us to slow down. Try again in a minute." };
    case "timeout":
    case "network":
      return { status: 504, error: "qloo_unreachable", detail: "The taste data service did not answer in time. Try again shortly." };
    case "not_found":
      return { status: 404, error: "qloo_not_found", detail: "There is no record for what was asked." };
    case "bad_request":
      return { status: 502, error: "qloo_bad_request", detail: "The taste data service rejected a request we built. This is our bug, and it was logged." };
    default:
      return { status: 502, error: "qloo_error", detail: "The taste data service returned an error. Try again shortly." };
  }
}
