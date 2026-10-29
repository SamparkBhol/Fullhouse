import { ApiFailure } from "./api.ts";

export interface Explained {
  title: string;
  body: string;
  retry: boolean;
}

export function explain(err: unknown): Explained {
  if (!(err instanceof ApiFailure)) {
    return { title: "Something broke on this page", body: "Reload the page and try again.", retry: true };
  }
  const code = err.code.toLowerCase();
  if (err.network) {
    return {
      title: "Full House is out of reach",
      body: "This phone could not reach the Full House server. Check the connection, then try again.",
      retry: true,
    };
  }
  if (code === "qloo_key_missing") {
    return {
      title: "This server has no taste data key",
      body: "This Full House server has no key for its taste data, so it cannot read the street. Nothing was read and nothing was made up. Whoever runs this server needs to add the key. Then try again.",
      retry: true,
    };
  }
  if (code.includes("budget")) {
    return {
      title: "Today's call budget is spent",
      body: "This server has used all the taste data calls it allows itself in a day, so it makes no new ones until the daily budget resets. Your saved read and your nights are still here.",
      retry: false,
    };
  }
  if (code === "rate_limited") {
    return {
      title: "This connection reached today's limit",
      body: err.detail ?? "Try again tomorrow.",
      retry: false,
    };
  }
  if (err.status === 429 || code.includes("rate") || code.includes("too_many")) {
    return {
      title: "Too many requests from this connection",
      body: "Wait a minute, then try again.",
      retry: true,
    };
  }
  if (err.status === 401 || err.status === 403) {
    return {
      title: "This phone is not signed in to this venue",
      body: "Open the owner link you saved when you created the venue. It signs this phone in.",
      retry: false,
    };
  }
  if (err.status === 404) {
    return {
      title: "Not found",
      body: "This venue or night does not exist anymore, or the link is incomplete.",
      retry: false,
    };
  }
  if (code.includes("qloo")) {
    return {
      title: "The taste data did not come back",
      body: err.detail ?? "The call for taste data failed. Nothing was filled in instead. Try again in a minute.",
      retry: true,
    };
  }
  return {
    title: "The server could not do that",
    body: err.detail ?? `It answered with ${err.code}. Try again.`,
    retry: true,
  };
}
