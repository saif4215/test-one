import Link from "next/link";
import { formatRate, getSport, listingPath, type Listing } from "../lib/listings";
import { CourtArt } from "./CourtArt";

export function ListingCard({ listing }: { listing: Listing }) {
  const sport = getSport(listing.sport);

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-lg">
      <div className="relative aspect-[5/3] overflow-hidden">
        <CourtArt
          sport={listing.sport}
          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {sport?.short}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base font-semibold leading-snug">
          {/* The stretched link makes the whole card clickable. */}
          <Link href={listingPath(listing)} className="after:absolute after:inset-0">
            {listing.name}
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {listing.area}, {listing.city} · {listing.indoor ? "Indoor" : "Outdoor"}
        </p>
        <p className="text-sm text-muted">{listing.blurb}</p>
        <p className="mt-auto pt-3 text-lg font-semibold">
          {formatRate(listing.hourlyRate)}
          <span className="ml-1 text-sm font-normal text-muted">
            · {listing.minHours}h minimum
          </span>
        </p>
      </div>
    </li>
  );
}
