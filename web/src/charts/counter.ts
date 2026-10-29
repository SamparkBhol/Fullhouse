import { plural } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { count } from "./time.ts";

export interface Counter {
  el: HTMLElement;
  set(value: number): void;
}

export type Say = (n: number) => string;

// "you" is the owner's own yes count, the one number on these screens drawn in the venue's green.
export type Tone = "ink" | "you";

// What a screen reader hears for a count, such as "1 RSVP" or "3 RSVPs".
export function saying(one: string, many: string, after = ""): Say {
  return (n) => `${plural(n, one, many)}${after}`;
}

// The figure is hidden from screen readers so they hear the whole phrase once, not a bare number.
export function counter(say: Say, tone: Tone = "ink"): Counter {
  const figure = h("span", { class: "counter-figure", "aria-hidden": "true" });
  const spoken = h("span", { class: "sr-only" });
  const el = h("p", { class: `counter counter-${tone}` }, figure, spoken);
  return {
    el,
    set(value: number) {
      const n = Math.max(0, Math.floor(value));
      figure.textContent = count(n);
      spoken.textContent = say(n);
    },
  };
}
