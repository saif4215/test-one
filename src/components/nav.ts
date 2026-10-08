export interface NavItem {
  href: string;
  label: string;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Startup-screen menu (§76) plus the supporting pages. */
export const NAV: NavGroup[] = [
  {
    label: "Research",
    items: [
      { href: "/products", label: "Find Products", description: "Browse, search, and filter every product you've researched or imported." },
      { href: "/analyze", label: "Analyze Product", description: "Look up an ASIN, UPC, URL, or name and run the full deal analysis." },
      { href: "/scan", label: "Scan Spreadsheet", description: "Upload a CSV or Excel buy list or supplier catalog; export the analyzed file." },
      { href: "/calculator", label: "Calculate Profit", description: "Quick profit, ROI, margin, break-even, and max buy price with formulas." },
      { href: "/deals", label: "Find Deals", description: "Run your deal filters and see why each product passed or failed." },
      { href: "/match", label: "Product Matching", description: "Check whether a supplier item really is the same as an Amazon listing." },
    ],
  },
  {
    label: "Listing Tools",
    items: [
      { href: "/listing-research", label: "Listing Research", description: "Record a listing's title, bullets, variations, questions, and complaints." },
      { href: "/listing-writer", label: "Listing Writer", description: "Generate an original title, bullets, description, and search terms without unsupported claims." },
      { href: "/keywords", label: "Keyword Research", description: "Find shared, high-intent phrases from titles and search terms you paste in." },
      { href: "/reviews", label: "Review Analysis", description: "Find common complaints and compliments in reviews you paste in." },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/inventory", label: "Track Inventory", description: "SKUs, quantities, landed cost, sales, and slow movers." },
      { href: "/purchase-orders", label: "Purchase Orders", description: "Create POs with landed cost, expected revenue, and ROI." },
      { href: "/suppliers", label: "Track Suppliers", description: "Supplier database with terms, lead times, and tradeoffs." },
      { href: "/cash-flow", label: "Cash Flow & Expenses", description: "Monthly cash flow, COGS vs. operating expenses, tax-prep export." },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/sales-intelligence", label: "Sales Intelligence", description: "Sales indicators, velocity ranges, and your own sales history." },
      { href: "/price-monitor", label: "Price Monitor", description: "Price history, averages, volatility, and seller-count changes." },
      { href: "/alerts", label: "Deal Alerts", description: "Timestamped alerts when products meet your criteria or change." },
      { href: "/dashboard", label: "Dashboard", description: "Revenue, profit, ROI, inventory value, cash, and slow movers." },
      { href: "/research-log", label: "Research Log", description: "Every analysis snapshot, with data sources and timestamps." },
    ],
  },
  {
    label: "Maruf Cafe Deal",
    items: [
      { href: "/agreements", label: "Purchase Agreements", description: "Prepare, review, e-sign, and track the Maruf Cafe business purchase agreement. Has its own sign-in." },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/capital", label: "Capital Planner", description: "Split your budget between inventory, shipping, operating costs, and a reserve." },
      { href: "/workflows", label: "Workflows", description: "Daily, weekly, and monthly checklists." },
      { href: "/business-plan", label: "Business Plan", description: "Build a business plan from your settings and records." },
      { href: "/glossary", label: "Glossary", description: "Plain-language definitions of reselling terms." },
      { href: "/settings", label: "Settings", description: "Budget, targets, filters, fee overrides, and data sources." },
    ],
  },
];
