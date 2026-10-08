/**
 * DocuSign eSignature REST API adapter (JWT Grant, embedded signing, Connect webhooks).
 *
 * IMPORTANT: this adapter was written from DocuSign's documented API shapes but
 * has NOT been run against a live DocuSign account. Before relying on it, run the
 * sandbox checklist in docs/AGREEMENTS.md and verify each call against
 * https://developers.docusign.com/docs/esign-rest-api/ .
 */
import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { docusignConfig, type DocuSignConfig } from "../config";
import { ProviderError, type EnvelopeState, type SignatureProvider, type SignerSpec, type WebhookVerdict } from "./types";

type FetchFn = typeof fetch;

const AUTH_HOST = { demo: "account-d.docusign.com", production: "account.docusign.com" } as const;
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export class DocuSignProvider implements SignatureProvider {
  readonly name = "docusign";
  private token: { value: string; expiresAt: number } | null = null;
  private baseUri: string | null = null;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  configuration() {
    const c = docusignConfig(this.env);
    return c.ok ? ({ ok: true } as const) : ({ ok: false, missing: c.missing } as const);
  }

  private cfg(): DocuSignConfig {
    const c = docusignConfig(this.env);
    if (!c.ok) throw new ProviderError(`DocuSign is not configured (missing: ${c.missing.join(", ")}).`);
    return c.config;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    const c = this.cfg();
    const host = AUTH_HOST[c.environment];
    const iat = Math.floor(this.now() / 1000);
    const claims = { iss: c.integrationKey, sub: c.userId, aud: host, iat, exp: iat + 3600, scope: "signature impersonation" };
    const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(c.privateKey).toString("base64url");
    const res = await this.fetchFn(`https://${host}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      const consent = body.error === "consent_required" ? " The API user has not granted consent to the integration key yet." : "";
      throw new ProviderError(`DocuSign sign-in failed (${body.error ?? res.status}).${consent}`, res.status);
    }
    this.token = { value: body.access_token, expiresAt: this.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  private async resolveBase(token: string): Promise<string> {
    const c = this.cfg();
    if (c.baseUri) return c.baseUri.replace(/\/+$/, "");
    if (this.baseUri) return this.baseUri;
    const res = await this.fetchFn(`https://${AUTH_HOST[c.environment]}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as { accounts?: Array<{ account_id: string; base_uri: string }> };
    const acct = body.accounts?.find((a) => a.account_id === c.accountId);
    if (!res.ok || !acct) throw new ProviderError("Could not find the configured DocuSign account for this API user.", res.status);
    this.baseUri = acct.base_uri.replace(/\/+$/, "");
    return this.baseUri;
  }

  private async api(path: string, init: RequestInit = {}, raw = false): Promise<Response | unknown> {
    const token = await this.accessToken();
    const base = await this.resolveBase(token);
    const c = this.cfg();
    const res = await this.fetchFn(`${base}/restapi/v2.1/accounts/${c.accountId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { errorCode?: string; message?: string };
      throw new ProviderError(`DocuSign request failed (${detail.errorCode ?? res.status}): ${detail.message ?? res.statusText}`, res.status);
    }
    return raw ? res : res.json().catch(() => ({}));
  }

  async createEnvelope(input: { pdf: Uint8Array; documentName: string; subject: string; signers: SignerSpec[] }) {
    const body = {
      emailSubject: input.subject,
      status: "sent",
      documents: [{ documentBase64: Buffer.from(input.pdf).toString("base64"), name: input.documentName, fileExtension: "pdf", documentId: "1" }],
      recipients: {
        signers: input.signers.map((s) => ({
          email: s.email,
          name: s.name,
          recipientId: s.recipientId,
          routingOrder: String(s.routingOrder),
          clientUserId: s.clientUserId, // makes this an embedded signer: DocuSign sends no email, our app invites them
          tabs: {
            signHereTabs: [{ documentId: "1", pageNumber: String(s.sign.page), xPosition: String(Math.round(s.sign.x)), yPosition: String(Math.round(s.sign.y)) }],
            dateSignedTabs: [{ documentId: "1", pageNumber: String(s.date.page), xPosition: String(Math.round(s.date.x)), yPosition: String(Math.round(s.date.y)) }],
          },
        })),
      },
    };
    const out = (await this.api("/envelopes", { method: "POST", body: JSON.stringify(body) })) as { envelopeId?: string };
    if (!out.envelopeId) throw new ProviderError("DocuSign did not return an envelope id.");
    return { envelopeId: out.envelopeId };
  }

  async createSigningSession(input: Parameters<SignatureProvider["createSigningSession"]>[0]) {
    const out = (await this.api(`/envelopes/${encodeURIComponent(input.envelopeId)}/views/recipient`, {
      method: "POST",
      body: JSON.stringify({
        returnUrl: input.returnUrl,
        authenticationMethod: input.authentication.method,
        authenticationInstant: input.authentication.at,
        assertionId: input.authentication.assertionId,
        email: input.signer.email,
        userName: input.signer.name,
        clientUserId: input.signer.clientUserId,
        recipientId: input.signer.recipientId,
      }),
    })) as { url?: string };
    if (!out.url) throw new ProviderError("DocuSign did not return a signing URL.");
    return { url: out.url };
  }

  async getEnvelope(envelopeId: string): Promise<EnvelopeState> {
    const out = (await this.api(`/envelopes/${encodeURIComponent(envelopeId)}?include=recipients`)) as {
      envelopeId?: string;
      status?: string;
      completedDateTime?: string;
      voidedReason?: string;
      recipients?: { signers?: Array<{ recipientId: string; clientUserId?: string; email?: string; status?: string; signedDateTime?: string; declinedDateTime?: string; declinedReason?: string }> };
    };
    return {
      envelopeId: out.envelopeId ?? envelopeId,
      status: (out.status ?? "").toLowerCase(),
      completedAt: out.completedDateTime,
      voidedReason: out.voidedReason,
      recipients: (out.recipients?.signers ?? []).map((r) => ({
        recipientId: r.recipientId,
        clientUserId: r.clientUserId,
        email: r.email,
        status: (r.status ?? "").toLowerCase(),
        signedAt: r.signedDateTime,
        declinedAt: r.declinedDateTime,
        declineReason: r.declinedReason,
      })),
    };
  }

  async voidEnvelope(envelopeId: string, reason: string) {
    await this.api(`/envelopes/${encodeURIComponent(envelopeId)}`, { method: "PUT", body: JSON.stringify({ status: "voided", voidedReason: reason.slice(0, 200) }) });
  }

  private async download(path: string): Promise<Uint8Array> {
    const res = (await this.api(path, { headers: { Accept: "application/pdf" } }, true)) as Response;
    return new Uint8Array(await res.arrayBuffer());
  }

  downloadSigned(envelopeId: string) {
    return this.download(`/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`);
  }

  downloadCertificate(envelopeId: string) {
    return this.download(`/envelopes/${encodeURIComponent(envelopeId)}/documents/certificate`);
  }

  /**
   * DocuSign Connect (JSON) signs the raw body with HMAC-SHA256 and sends the
   * base64 digest in X-DocuSign-Signature-1 (more headers if keys are rotated).
   */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerdict {
    const c = docusignConfig(this.env);
    if (!c.ok) return { ok: false, reason: "not configured" };
    const expected = createHmac("sha256", c.config.connectSecret).update(rawBody).digest();
    let matched = false;
    for (let i = 1; i <= 5; i++) {
      const h = headers.get(`x-docusign-signature-${i}`);
      if (!h) continue;
      const got = Buffer.from(h, "base64");
      if (got.length === expected.length && timingSafeEqual(got, expected)) matched = true;
    }
    if (!matched) return { ok: false, reason: "bad signature" };
    try {
      const j = JSON.parse(rawBody) as { event?: string; data?: { envelopeId?: string } };
      return { ok: true, envelopeId: j.data?.envelopeId, eventType: j.event };
    } catch {
      return { ok: false, reason: "invalid JSON" };
    }
  }
}
