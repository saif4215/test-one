import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "../../components/ListingCard";
import { SearchForm } from "../../components/SearchForm";
import {
  SPORTS,
  filterListings,
  getSport,
  hasActiveFilters,
  listings,
  parseFilters,
  sportPath,
} from "../../lib/listings";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { sport } = parseFilters(await searchParams);
  return { title: sport ? (getSport(sport)?.name ?? "Browse courts") : "Browse courts" };
}

export default async function RentalsPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);
  const results = filterListings(listings, filters);
  const heading = filters.sport ? getSport(filters.sport)?.name : "All courts and spaces";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>

      <nav aria-label="Sports" className="mt-5 flex flex-wrap gap-2">
        <Chip href="/rentals" active={!filters.sport}>
          All sports
        </Chip>
        {SPORTS.map((s) => (
          <Chip key={s.slug} href={sportPath(s.slug)} active={filters.sport === s.slug}>
            {s.short}
          </Chip>
        ))}
      </nav>

      <div className="mt-6">
        <SearchForm filters={filters} advanced />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" aria-live="polite">
          {results.length} {results.length === 1 ? "result" : "results"}
        </p>
        {hasActiveFilters(filters) ? (
          <Link href="/rentals" className="text-sm font-medium text-brand hover:underline">
            Clear filters
          </Link>
        ) : null}
      </div>

      {results.length > 0 ? (
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((listing) => (
            <ListingCard key={listing.slug} listing={listing} />
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <p className="font-semibold">No courts match those filters.</p>
          <p className="mt-1 text-sm text-muted">Try a higher price, another city, or fewer filters.</p>
          <Link
            href="/rentals"
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
          >
            Show all courts
          </Link>
        </div>
      )}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-brand bg-brand text-brand-ink"
          : "border-line bg-surface hover:border-brand hover:text-brand"
      }`}
    >
      {children}
    </Link>
  );
}
