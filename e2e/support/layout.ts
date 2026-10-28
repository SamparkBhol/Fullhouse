export const PHONE = { width: 360, height: 780 };

// An owner reads this behind the counter on a small phone, so nothing may push the page sideways.
export const SIDEWAYS = `(() => {
  const width = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > width + 1 || r.left < -1) && !el.closest(".leaflet-container") && !el.closest(".skip") && getComputedStyle(el).position !== "fixed";
    })
    .map((el) => el.tagName.toLowerCase() + "." + el.className);
  return document.documentElement.scrollWidth > width ? ["document", ...wide] : wide;
})()`;

export const SMALL_TARGETS = `[...document.querySelectorAll("button, .button, input, select")]
  .filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5) && !el.closest(".leaflet-container");
  })
  .map((el) => el.tagName.toLowerCase() + "." + el.className)`;
