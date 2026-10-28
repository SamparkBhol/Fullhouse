export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";

export type Params = Record<string, string | string[]>;

const SECRET_PARAM = /key|token|secret|password/i;

export function cleanParams(params: Params): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const key of Object.keys(params).sort()) {
    if (SECRET_PARAM.test(key)) continue;
    const raw = params[key];
    const values = (Array.isArray(raw) ? raw : [raw])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    if (values.length) out.push([key, values]);
  }
  return out;
}

// Arrays go as one comma joined value; repeating the key is refused with HTTP 400.
export function buildQuery(params: Params): string {
  const sp = new URLSearchParams();
  for (const [key, values] of cleanParams(params)) sp.append(key, values.join(","));
  return sp.toString();
}

export function buildUrl(baseUrl: string, path: string, params: Params): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) {
    throw new RangeError(`Invalid Qloo path ${path}`);
  }
  const base = baseUrl.replace(/\/+$/, "");
  const qs = buildQuery(params);
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

export function provenanceParams(params: Params): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, values] of cleanParams(params)) out[key] = values.join(",");
  return out;
}
