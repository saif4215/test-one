/** Daily, weekly, and monthly checklists (§29–§31), with links to the page for each task. */

export interface ChecklistItem {
  label: string;
  href?: string;
}

export const DAILY: ChecklistItem[] = [
  { label: "Check sales", href: "/inventory" },
  { label: "Check inventory", href: "/inventory" },
  { label: "Check pricing", href: "/price-monitor" },
  { label: "Check low-stock products", href: "/sales-intelligence" },
  { label: "Check customer returns" },
  { label: "Check account notifications (Seller Central)" },
  { label: "Research new products", href: "/analyze" },
  { label: "Contact suppliers", href: "/suppliers" },
  { label: "Record purchases", href: "/purchase-orders" },
  { label: "Update expenses", href: "/cash-flow" },
  { label: "Check shipments" },
  { label: "Review restricted-product issues" },
  { label: "Review business metrics", href: "/dashboard" },
];

export const WEEKLY: ChecklistItem[] = [
  { label: "Review revenue", href: "/dashboard" },
  { label: "Review profit", href: "/dashboard" },
  { label: "Review ROI", href: "/dashboard" },
  { label: "Review inventory", href: "/inventory" },
  { label: "Review slow-moving products", href: "/inventory" },
  { label: "Review pricing", href: "/price-monitor" },
  { label: "Review competition", href: "/sales-intelligence" },
  { label: "Research new products", href: "/deals" },
  { label: "Review suppliers", href: "/suppliers" },
  { label: "Review expenses", href: "/cash-flow" },
  { label: "Calculate cash available", href: "/cash-flow" },
  { label: "Identify products worth further research", href: "/products" },
];

export const MONTHLY: ChecklistItem[] = [
  { label: "Calculate revenue", href: "/dashboard" },
  { label: "Calculate COGS", href: "/dashboard" },
  { label: "Calculate gross profit", href: "/dashboard" },
  { label: "Calculate operating expenses", href: "/cash-flow" },
  { label: "Calculate estimated net profit", href: "/dashboard" },
  { label: "Calculate ROI", href: "/dashboard" },
  { label: "Calculate inventory turnover", href: "/dashboard" },
  { label: "Calculate cash flow", href: "/cash-flow" },
  { label: "Review suppliers", href: "/suppliers" },
  { label: "Review product performance", href: "/sales-intelligence" },
  { label: "Review returns" },
  { label: "Review refunds", href: "/cash-flow" },
  { label: "Review account health (Seller Central)" },
  { label: "Review business goals", href: "/business-plan" },
  { label: "Re-verify Amazon fee reference values", href: "/settings" },
];

/** ISO week key, e.g. 2026-W39. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function periodKeys(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    daily: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekly: isoWeekKey(now),
    monthly: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
  };
}
