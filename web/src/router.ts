export type Params = Record<string, string>;

export interface Route {
  pattern: RegExp;
  keys: string[];
  render: (params: Params) => void | Promise<void>;
}

const routes: Route[] = [];
let current = 0;
let fallback: Route["render"] = () => undefined;

export function notFound(render: Route["render"]): void {
  fallback = render;
}

export function route(path: string, render: Route["render"]): void {
  const keys: string[] = [];
  const source = path
    .split("/")
    .map((part) => {
      if (part.startsWith(":")) {
        keys.push(part.slice(1));
        return "([^/]+)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  routes.push({ pattern: new RegExp(`^${source}/?$`), keys, render });
}

export function isCurrent(ticket: number): boolean {
  return ticket === current;
}

export function ticket(): number {
  return current;
}

export async function resolve(): Promise<void> {
  current += 1;
  const path = location.pathname;
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (!m) continue;
    const params: Params = {};
    r.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(m[i + 1] ?? "");
    });
    await r.render(params);
    return;
  }
  await fallback({});
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.scrollTo(0, 0);
  void resolve();
}

function handledByWorker(path: string): boolean {
  return path.startsWith("/api/") || path.startsWith("/e/") || path.startsWith("/i/") || path.startsWith("/mcp") || path === "/live.txt";
}

export function startRouter(): void {
  window.addEventListener("popstate", () => void resolve());
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest("a") : null;
    if (!target || target.target || target.hasAttribute("download")) return;
    const href = target.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;
    const url = new URL(href, location.origin);
    if (handledByWorker(url.pathname)) return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
  void resolve();
}
