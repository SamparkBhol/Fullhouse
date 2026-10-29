import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { invalid, notFound, unauthorized, type Answer } from "./answers/answer.ts";
import { compare } from "./answers/compare.ts";
import { entities } from "./answers/entities.ts";
import { insights } from "./answers/insights.ts";
import { search } from "./answers/search.ts";
import { trending } from "./answers/trending.ts";
import { fakeCover, IMAGE_PATH } from "./image.ts";
import { RequestLog } from "./log.ts";
import { parseQuery, type Query } from "./params.ts";
import { PlaceRegistry } from "./world/registry.ts";

export interface FakeQloo {
  url: string;
  log: RequestLog;
  close(): Promise<void>;
}

const ROUTES: Record<string, (q: Query, places: PlaceRegistry) => Answer> = {
  "/search": search,
  "/entities": entities,
  "/v2/insights": insights,
  "/v2/analysis/compare": compare,
  "/v2/trending": (q) => trending(q),
};

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function answerFor(url: URL, places: PlaceRegistry): Answer {
  const route = ROUTES[url.pathname];
  if (!route) return notFound(url.pathname);
  const parsed = parseQuery(url.searchParams);
  if ("repeated" in parsed) return invalid(`${parsed.repeated} must be sent once, with values joined by commas`, parsed.repeated);
  return route(parsed.query, places);
}

function keyCheck(req: IncomingMessage, apiKey: string): { header: "present" | "missing"; accepted: boolean } {
  const sent = req.headers["x-api-key"];
  const value = Array.isArray(sent) ? sent[0] : sent;
  if (!value) return { header: "missing", accepted: false };
  return { header: "present", accepted: value === apiKey };
}

// /__fake/log and /__fake/reset are for the tests, /i/ stands in for images.qloo.com, and every other path answers like the Qloo host.
function handler(apiKey: string, log: RequestLog, places: PlaceRegistry) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://fake.qloo.local");
    if (req.method === "GET" && IMAGE_PATH.test(url.pathname)) {
      const png = fakeCover(url.pathname);
      res.writeHead(200, { "content-type": "image/png", "content-length": String(png.length), etag: `"${png.length}-${url.pathname.length}"` });
      res.end(png);
      return;
    }
    if (url.pathname === "/__fake/log") return send(res, 200, { requests: log.list() });
    if (url.pathname === "/__fake/reset" && req.method === "POST") {
      log.clear();
      return send(res, 200, { ok: true });
    }
    const key = keyCheck(req, apiKey);
    let answer: Answer;
    if (req.method !== "GET") answer = notFound(url.pathname);
    else if (!key.accepted) answer = unauthorized(key.header === "missing" ? "No API key found in request" : "API keys mismatch");
    else answer = answerFor(url, places);
    log.add({
      at: new Date().toISOString(),
      method: req.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      keyHeader: key.header,
      keyAccepted: key.accepted,
      status: answer.status,
    });
    send(res, answer.status, answer.body);
  };
}

export async function startFakeQloo(opts: { apiKey: string; port?: number; host?: string }): Promise<FakeQloo> {
  if (!opts.apiKey) throw new Error("the fake Qloo server needs the key it should accept");
  const log = new RequestLog();
  const server: Server = createServer(handler(opts.apiKey, log, new PlaceRegistry()));
  const host = opts.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${host}:${port}`,
    log,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
