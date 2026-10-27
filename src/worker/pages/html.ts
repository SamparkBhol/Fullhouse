const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (ch) => ESCAPES[ch] ?? ch);
}

export function safeHref(url: string): string {
  return /^(https?:|mailto:|\/)/i.test(url) && !/^\/\//.test(url) ? esc(url) : "#";
}
