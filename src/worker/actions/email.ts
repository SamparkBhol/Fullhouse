export const RESEND_API = "https://api.resend.com/emails";

export interface OwnerMail {
  subject: string;
  text: string;
  html: string;
}

export async function sendOwnerEmail(
  resend: { key: string; from: string },
  to: string,
  mail: OwnerMail,
  fetcher: typeof fetch,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetcher(RESEND_API, {
      method: "POST",
      headers: { authorization: `Bearer ${resend.key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: resend.from, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
  } catch {
    return { ok: false, reason: "The email service could not be reached." };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const msg = typeof body["message"] === "string" ? body["message"].slice(0, 200) : "";
    return { ok: false, reason: `The email service refused the message (HTTP ${res.status})${msg ? `. It said ${msg}` : ""}.` };
  }
  return { ok: true, id: typeof body["id"] === "string" ? body["id"] : "" };
}
