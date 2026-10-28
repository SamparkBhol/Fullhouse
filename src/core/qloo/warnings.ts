import { list, obj, str } from "./values.ts";

export interface QWarnings {
  notFound: string[];
  noExplain: boolean;
}

// Insights answers carry a top level warnings array, such as
// {type: "not_found", "signal.interests.entities": [ids]} when Qloo could not use an input for that type.
export function parseWarnings(body: unknown): QWarnings {
  const notFound: string[] = [];
  let noExplain = false;
  for (const w of list(obj(body).warnings)) {
    const type = str(obj(w).type) ?? "";
    if (type === "not_found") {
      for (const id of list(obj(w)["signal.interests.entities"])) {
        const s = str(id);
        if (s) notFound.push(s);
      }
    } else if (/explainability/i.test(type)) {
      noExplain = true;
    }
  }
  return { notFound, noExplain };
}
