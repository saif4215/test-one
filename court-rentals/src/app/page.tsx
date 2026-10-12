import Link from "next/link";
import { CourtArt } from "../components/CourtArt";
import { ListingCard } from "../components/ListingCard";
import { SearchForm } from "../components/SearchForm";
import { listYourSpaceMailto } from "../lib/booking";
import { SPORTS, countBySport, listings, parseFilters, sportPath } from "../lib/listings";
import { site } from "../lib/site";

export default function HomePage() {
  const featured = listings.filter((l) => l.featured).slice(0, 6);

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Find a court. <span className="text-brand">Book the hour.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">{site.description}</p>
          <div className="mt-8 max-w-4xl">
            <SearchForm filters={parseFilters({})} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Browse by sport</h2>
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SPORTS.map((sport) => (
            <li key={sport.slug} className="relative overflow-hidden rounded-2xl border border-line">
              <CourtArt sport={sport.slug} className="aspect-[4/3] w-full" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                <Link href={sportPath(sport.slug)} className="font-semibold after:absolute after:inset-0">
                  {sport.short}
                </Link>
                <p className="text-xs opacity-90">{countBySport(sport.slug)} listed</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Featured courts</h2>
          <Link href="/rentals" className="text-sm font-medium text-brand hover:underline">
            See all {listings.length} listings →
          </Link>
        </div>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((listing) => (
            <ListingCard key={listing.slug} listing={listing} />
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Own a court or gym?</h2>
            <p className="mt-1 max-w-xl text-muted">
              Fill the hours nobody is using. Tell us about your space and we will get it listed.
            </p>
          </div>
          <a
            href={listYourSpaceMailto()}
            className="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-ink hover:opacity-90"
          >
            List your space
          </a>
        </div>
      </section>
    </>
  );
}
