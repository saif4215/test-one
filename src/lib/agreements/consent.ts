import { sha256Hex } from "./security";

/** Bump the version whenever the wording changes; the signer's record stores the version and a hash of the text they saw. */
export const CONSENT_VERSION = "2026-10-01";

export const ESIGN_DISCLOSURE: string[] = [
  "You are being asked to review and sign this agreement electronically. Federal law (the ESIGN Act) and New York law (the Electronic Signatures and Records Act) generally allow electronic signatures and records to be used for commercial agreements, but they do not guarantee that every document or signature method is legally sufficient. Ask your attorney if you are unsure.",
  "Your consent is voluntary. You may decline to sign electronically and ask the sender for a paper copy to sign instead. You may withdraw your consent before you sign by closing this page and telling the sender; once you sign, the signature is part of the agreement.",
  "You need a current web browser, an email address you can read, and a program that opens PDF files. The signature itself is completed on the e-signature service's page, where you can type or draw your signature if that service offers those options.",
  "You can download a PDF of exactly what you are signing before you sign, and a copy of the signed agreement when every party has signed. Save your own copy; the sender's system also keeps one.",
  "Typing or drawing your name shows your intent to sign. The e-signature service also records the time, your email address, and technical details as evidence of the signing.",
];

export const REVIEW_STATEMENT = "I have reviewed the entire agreement, including every section and schedule, and I understand it. I had the opportunity to consult an attorney.";
export const CONSENT_STATEMENT = "I consent to use electronic records and signatures for this agreement, and I intend to sign it electronically.";

export const consentTextHash = () => sha256Hex([CONSENT_VERSION, ...ESIGN_DISCLOSURE, REVIEW_STATEMENT, CONSENT_STATEMENT].join("\n"));
