import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourtArt } from "../../../../components/CourtArt";
import { ListingCard } from "../../../../components/ListingCard";
import { bookingMailto } from "../../../../lib/booking";
import {
  formatRate,
  getListing,
  getSport,
  listings,
  relatedListings,
  sportPath,
} from "../../../../lib/listings";

type Params = Promise<{ sport: string; slug: string }>;

export function generateStaticParams() {
  return listings.map((l) => ({ sport: l.sport, slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sport, slug } = await params;
  const listing = getListing(sport, slug);
  if (!listing) return { title: "Court not found" };

  return {
    title: listing.name,
    description: `${listing.name} in ${listing.area}, ${listing.city}. ${listing.blurb} ${formatRate(listing.hourlyRate)}.`,
  };
}

export default async function ListingPage({ params }: { params: Params }) {
  const { sport: sportParam, slug } = await params;
  const listing = getListing(sportParam, slug);
  const sport = getSport(sportParam);
  if (!listing || !sport) notFound();

  const facts: [string, string][] = [
    ["Setting", listing.indoor ? "Indoor" : "Outdoor"],
    ["Surface", listing.surface],
    ["Max players", String(listing.maxPlayers)],
    ["Minimum booking", `${listing.minHours} hour${listing.minHours === 1 ? "" : "s"}`],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-brand">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={sportPath(sport.slug)} className="hover:text-brand">
              {sport.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {listing.name}
          </li>
        </ol>
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_340px]">
        <article>
          <CourtArt
            sport={listing.sport}
            className="aspect-[2/1] w-full rounded-2xl border border-line"
          />

          <h1 className="mt-6 text-3xl font-bold tracking-tight">{listing.name}</h1>
          <p className="mt-1 text-muted">
            {listing.area}, {listing.city}, {listing.state}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map(([term, value]) => (
              <div key={term} className="rounded-xl border border-line bg-surface p-3">
                <dt className="text-xs text-muted">{term}</dt>
                <dd className="mt-0.5 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">About this space</h2>
            <p className="mt-2 leading-relaxed text-muted">{listing.description}</p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Amenities</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {listing.amenities.map((a) => (
                <li key={a} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">
                  {a}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Hours</h2>
            <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
              {listing.hours.map((h) => (
                <div key={h.days} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                  <dt className="font-medium">{h.days}</dt>
                  <dd className="text-muted">{h.time}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-3xl font-bold">
              {formatRate(listing.hourlyRate)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {listing.minHours}-hour minimum · exact address shared once confirmed
            </p>
            <a
              href={bookingMailto(listing)}
              className="mt-5 block rounded-lg bg-brand px-4 py-3 text-center text-sm font-semibold text-brand-ink hover:opacity-90"
            >
              Request to book
            </a>
            <p className="mt-3 text-xs text-muted">
              Opens an email with this listing filled in. Availability and payment are confirmed
              directly; there is no online checkout yet.
            </p>
          </div>
        </aside>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">You might also like</h2>
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {relatedListings(listing).map((l) => (
            <ListingCard key={l.slug} listing={l} />
          ))}
        </ul>
      </section>
    </div>
  );
}
