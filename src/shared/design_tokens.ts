// The design tokens shared by the owner app and the worker rendered pages.
// web/src/styles/tokens.css repeats them for the owner app, and test/shared/design_tokens.test.ts keeps the two equal.
export const TOKENS = {
  street: "#33506e",
  fascia: "#243a53",
  chalk: "#f3f5f8",
  mist: "#b9c7d7",
  paper: "#f6d8db",
  ink: "#1d3150",
  "ink-soft": "#4a5b78",
  lit: "#ffc24a",
  stop: "#ffb3a6",
  rule: "rgba(243, 245, 248, 0.18)",
  tape: "rgba(236, 228, 204, 0.86)",
  glow: "rgba(255, 194, 74, 0.42)",
  face: '"Archivo Variable", "Archivo", "Helvetica Neue", Arial, sans-serif',
  s14: "0.875rem",
  s16: "1rem",
  s18: "1.125rem",
  s21: "1.3125rem",
  s24: "1.5rem",
  s36: "2.25rem",
  s48: "3rem",
  s60: "3.75rem",
  s72: "4.5rem",
  radius: "6px",
} as const;

export function rootRule(): string {
  const props = Object.entries(TOKENS).map(([name, value]) => `--${name}:${value}`);
  return `:root{${props.join(";")}}`;
}
