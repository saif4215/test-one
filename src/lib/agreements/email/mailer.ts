/** Email boundary. Production uses Resend; tests inject their own Mailer. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { resendConfig } from "../config";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Same key = same message: the provider will not send it twice. */
  idempotencyKey: string;
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface Mailer {
  readonly name: string;
  configured(): boolean;
  send(email: OutgoingEmail): Promise<SendResult>;
}

export class ResendMailer implements Mailer {
  readonly name = "resend";
  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly fetchFn: typeof fetch = fetch) {}

  configured() {
    return resendConfig(this.env).ok;
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const c = resendConfig(this.env);
    if (!c.ok) return { ok: false, error: `Email is not configured (missing: ${c.missing.join(", ")}).` };
    try {
      const res = await this.fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${c.config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": email.idempotencyKey },
        body: JSON.stringify({ from: c.config.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok || !body.id) return { ok: false, error: `Email service rejected the message (${body.name ?? res.status}): ${body.message ?? res.statusText}`.slice(0, 300) };
      return { ok: true, messageId: body.id };
    } catch (e) {
      return { ok: false, error: `Could not reach the email service: ${e instanceof Error ? e.message : "network error"}`.slice(0, 300) };
    }
  }
}

/**
 * Verifies a Resend (Svix) webhook: HMAC-SHA256 over "id.timestamp.body" with the
 * base64 key after the "whsec_" prefix; signatures arrive as "v1,<base64>" tokens.
 */
export function verifySvix(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowMs = Date.now(),
  toleranceSec = 300,
): { ok: true; id: string } | { ok: false; reason: string } {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return { ok: false, reason: "missing headers" };
  if (!/^\d+$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > toleranceSec) return { ok: false, reason: "timestamp outside tolerance" };
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();
  for (const part of sig.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const got = Buffer.from(value, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true, id };
  }
  return { ok: false, reason: "bad signature" };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain, accessible email layout with one call-to-action link. */
export function renderEmail(opts: { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footnote?: string }) {
  const text = [opts.heading, "", ...opts.paragraphs, ...(opts.cta ? ["", `${opts.cta.label}: ${opts.cta.url}`] : []), ...(opts.footnote ? ["", opts.footnote] : [])].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#16191d"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe3e8;border-radius:8px"><tr><td style="padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${esc(opts.heading)}</h1>${opts.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(p)}</p>`).join("")}${opts.cta ? `<p style="margin:20px 0"><a href="${esc(opts.cta.url)}" style="background:#1f5fbf;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">${esc(opts.cta.label)}</a></p><p style="font-size:12px;color:#5b6470;word-break:break-all">If the button doesn't work, copy this link into your browser:<br>${esc(opts.cta.url)}</p>` : ""}${opts.footnote ? `<p style="font-size:12px;color:#5b6470;margin-top:20px">${esc(opts.footnote)}</p>` : ""}</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
