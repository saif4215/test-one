export const AGREEMENT_STATUSES = [
  "draft",
  "awaiting_review",
  "sent_for_signature",
  "viewed",
  "partially_signed",
  "fully_signed",
  "declined",
  "expired",
  "cancelled",
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const STATUS_LABEL: Record<AgreementStatus, string> = {
  draft: "Draft",
  awaiting_review: "Awaiting Review",
  sent_for_signature: "Sent for Signature",
  viewed: "Viewed",
  partially_signed: "Partially Signed",
  fully_signed: "Fully Signed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const isStatus = (v: string): v is AgreementStatus => (AGREEMENT_STATUSES as readonly string[]).includes(v);

export type SignerStatus = "pending" | "invited" | "viewed" | "signed" | "declined" | "expired" | "revoked";

/**
 * Status of a live signature request, derived only from what the signature
 * provider has confirmed about each signer. "Fully signed" requires every
 * signer to be confirmed signed AND the provider to have verified completion.
 */
export function deriveSigningStatus(signers: Array<{ status: string }>, providerVerifiedComplete: boolean): AgreementStatus {
  if (signers.length === 0) return "sent_for_signature";
  if (signers.some((s) => s.status === "declined")) return "declined";
  const signed = signers.filter((s) => s.status === "signed").length;
  if (signed === signers.length && providerVerifiedComplete) return "fully_signed";
  if (signed > 0) return "partially_signed";
  if (signers.some((s) => s.status === "viewed")) return "viewed";
  return "sent_for_signature";
}

export const PARTY_LABEL = { buyer: "Buyer", seller: "Seller" } as const;
