export const SPORTS = [
  { slug: "basketball", name: "Basketball Courts", short: "Basketball" },
  { slug: "pickleball", name: "Pickleball Courts", short: "Pickleball" },
  { slug: "volleyball", name: "Volleyball Courts", short: "Volleyball" },
  { slug: "tennis", name: "Tennis Courts", short: "Tennis" },
  { slug: "futsal", name: "Indoor Soccer & Futsal", short: "Futsal" },
] as const;

export type SportSlug = (typeof SPORTS)[number]["slug"];

export type Listing = {
  /** URL-safe and unique across all listings. */
  slug: string;
  name: string;
  sport: SportSlug;
  city: string;
  /** Neighborhood within the city. Exact addresses are shared after a booking is confirmed. */
  area: string;
  state: string;
  hourlyRate: number;
  minHours: number;
  maxPlayers: number;
  indoor: boolean;
  surface: string;
  blurb: string;
  description: string;
  amenities: string[];
  hours: { days: string; time: string }[];
  featured?: boolean;
};

// Invented sample listings. Replace with real venues (or load them from a database) before launch.
export const listings: Listing[] = [
  {
    slug: "harbor-street-gym-court-a",
    name: "Harbor Street Gym — Court A",
    sport: "basketball",
    city: "Staten Island",
    area: "St. George",
    state: "NY",
    hourlyRate: 90,
    minHours: 1,
    maxPlayers: 14,
    indoor: true,
    surface: "Maple hardwood",
    blurb: "Full-size indoor court with a scoreboard and bleachers.",
    description:
      "A regulation-size hardwood court inside a converted warehouse gym. Good for pickup runs, team practices and small tournaments. Two adjustable hoops, a shot clock and seating for 40.",
    amenities: ["Scoreboard", "Bleachers", "Locker room", "Water fountain", "Street parking"],
    hours: [
      { days: "Mon – Fri", time: "6:00 AM – 10:00 PM" },
      { days: "Sat – Sun", time: "8:00 AM – 8:00 PM" },
    ],
    featured: true,
  },
  {
    slug: "bayview-rec-center-full-court",
    name: "Bayview Rec Center — Full Court",
    sport: "basketball",
    city: "Brooklyn",
    area: "Bay Ridge",
    state: "NY",
    hourlyRate: 120,
    minHours: 2,
    maxPlayers: 20,
    indoor: true,
    surface: "Sprung hardwood",
    blurb: "Sprung floor, two side courts and a full-time attendant.",
    description:
      "A community rec center that rents its main gym by the hour in the evenings and on weekends. The sprung floor is easy on the knees, and an attendant is on site for the whole booking.",
    amenities: ["On-site attendant", "Locker rooms", "Bleachers", "Wi-Fi", "Transit nearby"],
    hours: [
      { days: "Mon – Fri", time: "5:00 PM – 10:30 PM" },
      { days: "Sat – Sun", time: "9:00 AM – 9:00 PM" },
    ],
    featured: true,
  },
  {
    slug: "greenway-outdoor-courts",
    name: "Greenway Outdoor Courts",
    sport: "basketball",
    city: "Staten Island",
    area: "Great Kills",
    state: "NY",
    hourlyRate: 35,
    minHours: 1,
    maxPlayers: 10,
    indoor: false,
    surface: "Painted asphalt",
    blurb: "Lit outdoor half-courts, bookable for private runs.",
    description:
      "Two fenced outdoor half-courts with night lighting. Reserve a court so your group does not have to wait for the next game.",
    amenities: ["Night lighting", "Fenced courts", "Free parking", "Benches"],
    hours: [{ days: "Every day", time: "7:00 AM – 9:00 PM" }],
  },
  {
    slug: "liberty-sports-loft",
    name: "Liberty Sports Loft",
    sport: "basketball",
    city: "Jersey City",
    area: "Downtown",
    state: "NJ",
    hourlyRate: 140,
    minHours: 1,
    maxPlayers: 16,
    indoor: true,
    surface: "Hardwood",
    blurb: "Rooftop-style loft court with city views and a lounge.",
    description:
      "A premium indoor court with a lounge area for before and after games. Popular for corporate events and league nights.",
    amenities: ["Lounge", "Showers", "Sound system", "Scoreboard", "Transit nearby"],
    hours: [
      { days: "Mon – Fri", time: "7:00 AM – 11:00 PM" },
      { days: "Sat – Sun", time: "8:00 AM – 10:00 PM" },
    ],
  },
  {
    slug: "pine-ridge-pickleball-court-3",
    name: "Pine Ridge Pickleball — Court 3",
    sport: "pickleball",
    city: "Staten Island",
    area: "Todt Hill",
    state: "NY",
    hourlyRate: 40,
    minHours: 1,
    maxPlayers: 4,
    indoor: false,
    surface: "Cushioned acrylic",
    blurb: "Quiet, tree-lined outdoor court with loaner paddles.",
    description:
      "A dedicated pickleball court with a cushioned acrylic surface and a permanent net. Paddles and balls are available to borrow, so beginners can just show up.",
    amenities: ["Loaner paddles", "Shaded seating", "Free parking", "Restrooms"],
    hours: [{ days: "Every day", time: "7:00 AM – 8:00 PM" }],
    featured: true,
  },
  {
    slug: "cedar-point-indoor-pickleball",
    name: "Cedar Point Indoor Pickleball",
    sport: "pickleball",
    city: "Brooklyn",
    area: "Gravesend",
    state: "NY",
    hourlyRate: 55,
    minHours: 1,
    maxPlayers: 4,
    indoor: true,
    surface: "Sport tile",
    blurb: "Four climate-controlled courts, open all year.",
    description:
      "Indoor courts with sport-tile flooring and bright, glare-free lighting. Rain, heat or snow, your game still happens.",
    amenities: ["Climate control", "Loaner paddles", "Lockers", "Pro shop"],
    hours: [
      { days: "Mon – Fri", time: "6:00 AM – 10:00 PM" },
      { days: "Sat – Sun", time: "7:00 AM – 9:00 PM" },
    ],
  },
  {
    slug: "riverside-paddle-and-pickle",
    name: "Riverside Paddle & Pickle",
    sport: "pickleball",
    city: "Jersey City",
    area: "Journal Square",
    state: "NJ",
    hourlyRate: 48,
    minHours: 1,
    maxPlayers: 4,
    indoor: false,
    surface: "Hard court",
    blurb: "Two lit courts next to a café.",
    description:
      "Two outdoor pickleball courts with lighting for evening play and a café on site for the après-game coffee.",
    amenities: ["Night lighting", "Café", "Bike racks", "Restrooms"],
    hours: [{ days: "Every day", time: "8:00 AM – 10:00 PM" }],
  },
  {
    slug: "southshore-volleyball-hall",
    name: "Southshore Volleyball Hall",
    sport: "volleyball",
    city: "Staten Island",
    area: "Tottenville",
    state: "NY",
    hourlyRate: 75,
    minHours: 2,
    maxPlayers: 12,
    indoor: true,
    surface: "Hardwood",
    blurb: "High ceilings, two nets, adjustable for indoor or beach-rules play.",
    description:
      "A hall with 24-foot ceilings and two net systems. Nets can be set for men's, women's or coed heights. Standards and antennas are provided.",
    amenities: ["Two nets", "Adjustable heights", "Ball cart", "Locker room"],
    hours: [
      { days: "Mon – Fri", time: "5:00 PM – 10:00 PM" },
      { days: "Sat – Sun", time: "9:00 AM – 8:00 PM" },
    ],
  },
  {
    slug: "boardwalk-sand-court",
    name: "Boardwalk Sand Court",
    sport: "volleyball",
    city: "Brooklyn",
    area: "Coney Island",
    state: "NY",
    hourlyRate: 30,
    minHours: 1,
    maxPlayers: 12,
    indoor: false,
    surface: "Sand",
    blurb: "Beach-style sand court a short walk from the boardwalk.",
    description:
      "A groomed sand court with a regulation net. Bring your own ball or borrow one from the on-site shed.",
    amenities: ["Ball loans", "Showers", "Seating", "Transit nearby"],
    hours: [{ days: "Every day", time: "9:00 AM – sunset" }],
    featured: true,
  },
  {
    slug: "lakeview-tennis-hard-court-2",
    name: "Lakeview Tennis — Hard Court 2",
    sport: "tennis",
    city: "Queens",
    area: "Forest Hills",
    state: "NY",
    hourlyRate: 45,
    minHours: 1,
    maxPlayers: 4,
    indoor: false,
    surface: "Hard court",
    blurb: "Well-kept hard court with a practice wall nearby.",
    description:
      "A resurfaced hard court with new nets every season. A hitting wall is a few steps away for solo practice before your booking.",
    amenities: ["Practice wall", "Benches", "Water refill", "Street parking"],
    hours: [{ days: "Every day", time: "7:00 AM – 9:00 PM" }],
    featured: true,
  },
  {
    slug: "maple-hollow-clay-court",
    name: "Maple Hollow Clay Court",
    sport: "tennis",
    city: "Staten Island",
    area: "Sunnyside",
    state: "NY",
    hourlyRate: 60,
    minHours: 1,
    maxPlayers: 4,
    indoor: false,
    surface: "Red clay",
    blurb: "Rare clay court, watered and brushed before every booking.",
    description:
      "A single red-clay court maintained between bookings. Clay is easier on joints and plays slower, which makes for longer rallies.",
    amenities: ["Court maintenance", "Seating", "Free parking"],
    hours: [{ days: "Tue – Sun", time: "8:00 AM – 7:00 PM" }],
  },
  {
    slug: "metro-futsal-box",
    name: "Metro Futsal Box",
    sport: "futsal",
    city: "Queens",
    area: "Long Island City",
    state: "NY",
    hourlyRate: 110,
    minHours: 1,
    maxPlayers: 12,
    indoor: true,
    surface: "Turf",
    blurb: "Walled indoor pitch for 5-a-side games.",
    description:
      "A boarded indoor pitch with small goals, ideal for 5-a-side. Bring a ball or borrow one from the front desk.",
    amenities: ["Boarded walls", "Bibs provided", "Showers", "Vending"],
    hours: [
      { days: "Mon – Fri", time: "4:00 PM – 11:00 PM" },
      { days: "Sat – Sun", time: "9:00 AM – 10:00 PM" },
    ],
    featured: true,
  },
];

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/**
 * The only place that builds a listing's URL, so a missing field can never end up as
 * "/undefined/" in a link. Example: /rentals/basketball/harbor-street-gym-court-a
 */
export function listingPath(listing: Pick<Listing, "sport" | "slug">): string {
  return `/rentals/${listing.sport}/${listing.slug}`;
}

export function sportPath(sport: SportSlug): string {
  return `/rentals?sport=${sport}`;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
}

/** Looks a listing up by both URL segments, so /rentals/tennis/<a basketball slug> is a 404. */
export function getListing(sport: string, slug: string): Listing | undefined {
  return listings.find((l) => l.sport === sport && l.slug === slug);
}

export const cities: string[] = [...new Set(listings.map((l) => l.city))].sort();

export function countBySport(sport: SportSlug): number {
  return listings.filter((l) => l.sport === sport).length;
}

export function relatedListings(listing: Listing, limit = 3): Listing[] {
  return listings
    .filter((l) => l.slug !== listing.slug)
    .sort((a, b) => score(b, listing) - score(a, listing))
    .slice(0, limit);
}

function score(candidate: Listing, base: Listing): number {
  return (candidate.sport === base.sport ? 2 : 0) + (candidate.city === base.city ? 1 : 0);
}

export function formatRate(rate: number): string {
  return `$${rate}/hr`;
}

// ---------------------------------------------------------------------------
// Search filters (parsed from the URL query string)
// ---------------------------------------------------------------------------

export const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
] as const;

export type SortValue = (typeof SORTS)[number]["value"];

export type Filters = {
  sport?: SportSlug;
  city?: string;
  q?: string;
  maxRate?: number;
  setting?: "indoor" | "outdoor";
  sort: SortValue;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Turns an untrusted query string into valid filters. Unknown or malformed values are dropped. */
export function parseFilters(raw: RawParams): Filters {
  const sport = first(raw.sport);
  const city = first(raw.city);
  const q = first(raw.q)?.trim().slice(0, 80);
  const maxRate = Number.parseInt(first(raw.maxRate) ?? "", 10);
  const setting = first(raw.setting);
  const sort = first(raw.sort);

  return {
    sport: SPORTS.find((s) => s.slug === sport)?.slug,
    city: cities.find((c) => c === city),
    q: q ? q : undefined,
    maxRate: Number.isFinite(maxRate) && maxRate > 0 ? maxRate : undefined,
    setting: setting === "indoor" || setting === "outdoor" ? setting : undefined,
    sort: SORTS.find((s) => s.value === sort)?.value ?? "featured",
  };
}

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.sport || f.city || f.q || f.maxRate || f.setting);
}

export function filterListings(all: Listing[], f: Filters): Listing[] {
  const needle = f.q?.toLowerCase();
  const matches = all.filter((l) => {
    if (f.sport && l.sport !== f.sport) return false;
    if (f.city && l.city !== f.city) return false;
    if (f.maxRate && l.hourlyRate > f.maxRate) return false;
    if (f.setting && l.indoor !== (f.setting === "indoor")) return false;
    if (needle) {
      const haystack = `${l.name} ${l.area} ${l.city} ${l.surface} ${l.blurb}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  switch (f.sort) {
    case "price-asc":
      return matches.sort((a, b) => a.hourlyRate - b.hourlyRate);
    case "price-desc":
      return matches.sort((a, b) => b.hourlyRate - a.hourlyRate);
    case "name":
      return matches.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return matches.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  }
}
