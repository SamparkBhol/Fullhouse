import { uuidFrom } from "../seed.ts";

export interface Answer {
  status: number;
  body: unknown;
}

export function ok(body: unknown): Answer {
  return { status: 200, body };
}

// Insights, compare and trending report errors as {errors: [{message, path}]}.
export function invalid(message: string, path?: string): Answer {
  return { status: 400, body: { errors: [path ? { message, path } : { message }] } };
}

// /search and the gateway report errors as {error: {code, message, reason}}.
export function searchInvalid(message: string): Answer {
  return { status: 400, body: { error: { code: 400, message, reason: "Bad Request", request_id: uuidFrom(message).toLowerCase() } } };
}

export function unauthorized(reason: string): Answer {
  return { status: 401, body: { error: { reason, message: "Unauthorized", code: 401 } } };
}

export function notFound(path: string): Answer {
  return { status: 404, body: { error: { code: 404, message: "Not Found", reason: `No route for ${path}` } } };
}
