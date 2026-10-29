// The design tokens shared by the owner app and the worker rendered pages.
// web/src/styles/tokens.css repeats them for the owner app, and test/shared/design_tokens.test.ts keeps the two equal.
export const TOKENS = {
  page: "#f4f5f2",
  surface: "#ffffff",
  ink: "#14201a",
  "ink-2": "#4f5d55",
  "ink-3": "#67736c",
  rule: "#dadfda",
  "rule-strong": "#b7c0ba",
  you: "#0d6a4a",
  "you-deep": "#0a4f37",
  "you-tint": "#e3efe9",
  them: "#8a2f63",
  "them-deep": "#6e244f",
  "them-tint": "#f4e6ee",
  face: '"Schibsted Grotesk Variable", "Schibsted Grotesk", system-ui, sans-serif',
  "t-small": "0.875rem",
  "t-body": "1.0625rem",
  "t-lead": "1.25rem",
  "t-h3": "1.375rem",
  "t-h2": "2rem",
  "t-h1": "clamp(2.5rem, 1.6rem + 3.6vw, 4.25rem)",
  "r-photo": "6px",
  "r-control": "10px",
  "r-panel": "18px",
  gutter: "16px",
  max: "1200px",
} as const;

export function rootRule(): string {
  const props = Object.entries(TOKENS).map(([name, value]) => `--${name}:${value}`);
  return `:root{${props.join(";")}}`;
}
