/**
 * The e-signature provider boundary. The app talks only to this interface, so
 * the provider (DocuSign here) can be swapped without touching the workflow.
 * There is deliberately no "fake" implementation outside the test suite.
 */

export interface SignerSpec {
  party: "buyer" | "seller";
  name: string;
  email: string;
  /** Opaque id that marks this recipient as an embedded (in-app) signer. */
  clientUserId: string;
  routingOrder: number;
  recipientId: string;
  sign: { page: number; x: number; y: number };
  date: { page: number; x: number; y: number };
}

export interface RecipientState {
  recipientId: string;
  clientUserId?: string;
  email?: string;
  /** Provider status, normalized to lower case: created | sent | delivered | completed | declined | authenticationfailed | ... */
  status: string;
  signedAt?: string;
  declinedAt?: string;
  declineReason?: string;
}

export interface EnvelopeState {
  envelopeId: string;
  /** created | sent | delivered | completed | declined | voided | ... */
  status: string;
  completedAt?: string;
  voidedReason?: string;
  recipients: RecipientState[];
}

export interface WebhookVerdict {
  ok: boolean;
  reason?: string;
  envelopeId?: string;
  eventType?: string;
}

export interface SignatureProvider {
  readonly name: string;
  /** Cheap check that credentials exist. Does not prove they work. */
  configuration(): { ok: true } | { ok: false; missing: string[] };
  createEnvelope(input: { pdf: Uint8Array; documentName: string; subject: string; signers: SignerSpec[] }): Promise<{ envelopeId: string }>;
  createSigningSession(input: {
    envelopeId: string;
    signer: { name: string; email: string; clientUserId: string; recipientId: string };
    returnUrl: string;
    authentication: { method: string; at: string; assertionId: string };
  }): Promise<{ url: string }>;
  getEnvelope(envelopeId: string): Promise<EnvelopeState>;
  voidEnvelope(envelopeId: string, reason: string): Promise<void>;
  downloadSigned(envelopeId: string): Promise<Uint8Array>;
  downloadCertificate(envelopeId: string): Promise<Uint8Array>;
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerdict;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}
