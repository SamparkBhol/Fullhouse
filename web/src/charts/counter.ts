import { plural } from "../../../src/shared/words.ts";
import { h, prefersReducedMotion } from "../dom.ts";

const MIN_DIGITS = 4;

export interface Counter {
  el: HTMLElement;
  set(value: number): void;
}

function wheel(): HTMLElement {
  return h("span", { class: "wheel" }, h("span", { class: "wheel-strip" }, ...Array.from({ length: 10 }, (_, d) => h("span", null, String(d)))));
}

function turn(w: Element, digit: number, animate: boolean): void {
  const strip = w.firstElementChild as HTMLElement | null;
  if (!strip) return;
  strip.classList.toggle("rolls", animate);
  strip.style.transform = `translateY(${-digit}em)`;
}

// The clicker at a venue door: chalk windows with ink digits and leading zeros. When a count changes,
// only the wheels whose digit changed roll, once.
export type Say = (n: number) => string;

// What a screen reader hears for a count, such as "1 RSVP" or "3 RSVPs".
export function saying(one: string, many: string, after = ""): Say {
  return (n) => `${plural(n, one, many)}${after}`;
}

export function doorCounter(say: Say, tone: "chalk" | "lit" = "chalk", minDigits = MIN_DIGITS): Counter {
  const wheels = h("span", { class: "wheels", "aria-hidden": "true" });
  const spoken = h("span", { class: "sr-only" });
  const el = h("p", { class: `counter counter-${tone}` }, wheels, spoken);
  let shown: number | null = null;
  return {
    el,
    set(value: number) {
      const n = Math.max(0, Math.floor(value));
      const digits = String(n).padStart(minDigits, "0").split("").map(Number);
      while (wheels.children.length < digits.length) wheels.prepend(wheel());
      while (wheels.children.length > digits.length) wheels.firstElementChild?.remove();
      const animate = shown !== null && shown !== n && !prefersReducedMotion();
      [...wheels.children].forEach((w, i) => turn(w, digits[i] ?? 0, animate));
      spoken.textContent = say(n);
      shown = n;
    },
  };
}
