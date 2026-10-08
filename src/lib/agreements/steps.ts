/** The agreement builder's steps, shared by the UI and the readiness checks. */
export const STEPS = [
  { key: "buyer", n: 1, label: "Buyer" },
  { key: "seller", n: 2, label: "Seller" },
  { key: "business", n: 3, label: "Business & transaction" },
  { key: "assets", n: 4, label: "Assets" },
  { key: "price", n: 5, label: "Price & payments" },
  { key: "terms", n: 6, label: "Lease, liabilities & conditions" },
  { key: "documents", n: 7, label: "Supporting documents" },
  { key: "preview", n: 8, label: "Preview" },
  { key: "submit", n: 9, label: "Confirm & submit" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];
export const isStepKey = (v: string): v is StepKey => STEPS.some((s) => s.key === v);

/** Where a readiness problem is fixed: a full-builder step, or the single quick-form page. */
export type IssueStep = StepKey | "quick";
