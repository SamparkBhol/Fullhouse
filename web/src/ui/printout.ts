import { h } from "../dom.ts";

// The chatbot answers in markdown. Its words are printed as it wrote them; only the markup is set as type.
export function printout(text: string): HTMLElement {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return h(
    "div",
    { class: "printout-text" },
    paragraphs.map((p) =>
      h(
        "p",
        null,
        p.split("\n").flatMap((line, i) => {
          const clean = line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "");
          return [i ? h("br") : null, ...strong(clean)];
        }),
      ),
    ),
  );
}

function strong(line: string): (Node | string)[] {
  return line
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 ? h("strong", null, part) : part.replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,;!?])/g, "$1$2")))
    .filter((part) => part !== "");
}

// "@cf/mistralai/mistral-small-3.1-24b-instruct" reads as "Mistral Small 3.1 24B".
export function modelName(id: string): string {
  const last = id.split("/").pop() ?? id;
  const words = last
    .split("-")
    .filter((w) => !/^(instruct|chat|fast|fp8|fp16|awq|int8|v\d+)$/i.test(w))
    .map((w) => (/^\d+(\.\d+)?b$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)));
  return words.join(" ") || id;
}
