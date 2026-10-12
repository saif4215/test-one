import { formatRate, type Listing } from "./listings";
import { site } from "./site";

/**
 * There is no booking backend yet, so "Request to book" opens the visitor's email app with the
 * listing details filled in. Every value is percent-encoded, so spaces, "&" and "—" survive.
 */
export function bookingMailto(listing: Listing): string {
  const subject = `Booking request: ${listing.name}`;
  const body = [
    `Hi, I'd like to book ${listing.name} (${formatRate(listing.hourlyRate)}, ${listing.city}, ${listing.state}).`,
    "",
    "Preferred date:",
    "Start time:",
    "Number of hours:",
    "Number of players:",
    "",
    "Thanks!",
  ].join("\n");

  return `mailto:${site.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function listYourSpaceMailto(): string {
  const subject = "List my space";
  const body = [
    "Hi, I'd like to list my court or gym.",
    "",
    "Venue name:",
    "Sport:",
    "City / neighborhood:",
    "Hourly rate:",
  ].join("\n");

  return `mailto:${site.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
