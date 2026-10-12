import { useId } from "react";
import type { SportSlug } from "../lib/listings";

// Decorative top-down court drawings so the site needs no photo assets.
const FLOOR: Record<SportSlug, [string, string]> = {
  basketball: ["#c2703a", "#9a4f22"],
  pickleball: ["#1f7a6d", "#14564c"],
  volleyball: ["#d9a441", "#b0822a"],
  tennis: ["#2f7d46", "#215a32"],
  futsal: ["#2d5fc4", "#1f438f"],
};

function Lines({ sport }: { sport: SportSlug }) {
  switch (sport) {
    case "basketball":
      return (
        <>
          <rect x="20" y="15" width="160" height="90" />
          <line x1="100" y1="15" x2="100" y2="105" />
          <circle cx="100" cy="60" r="12" />
          <rect x="20" y="45" width="38" height="30" />
          <rect x="142" y="45" width="38" height="30" />
          <circle cx="58" cy="60" r="10" />
          <circle cx="142" cy="60" r="10" />
          <path d="M20 28 H34 A32 32 0 0 1 34 92 H20" />
          <path d="M180 28 H166 A32 32 0 0 0 166 92 H180" />
        </>
      );
    case "pickleball":
      return (
        <>
          <rect x="30" y="25" width="140" height="70" />
          <line x1="100" y1="25" x2="100" y2="95" strokeWidth="2.5" />
          <line x1="78" y1="25" x2="78" y2="95" />
          <line x1="122" y1="25" x2="122" y2="95" />
          <line x1="30" y1="60" x2="78" y2="60" />
          <line x1="122" y1="60" x2="170" y2="60" />
        </>
      );
    case "volleyball":
      return (
        <>
          <rect x="30" y="25" width="140" height="70" />
          <line x1="100" y1="20" x2="100" y2="100" strokeWidth="2.5" />
          <line x1="77" y1="25" x2="77" y2="95" />
          <line x1="123" y1="25" x2="123" y2="95" />
        </>
      );
    case "tennis":
      return (
        <>
          <rect x="20" y="23" width="160" height="74" />
          <line x1="20" y1="32" x2="180" y2="32" />
          <line x1="20" y1="88" x2="180" y2="88" />
          <line x1="100" y1="23" x2="100" y2="97" strokeWidth="2.5" />
          <line x1="57" y1="32" x2="57" y2="88" />
          <line x1="143" y1="32" x2="143" y2="88" />
          <line x1="57" y1="60" x2="143" y2="60" />
        </>
      );
    case "futsal":
      return (
        <>
          <rect x="30" y="25" width="140" height="70" />
          <line x1="100" y1="25" x2="100" y2="95" />
          <circle cx="100" cy="60" r="10" />
          <path d="M30 42 A18 18 0 0 1 30 78" />
          <path d="M170 42 A18 18 0 0 0 170 78" />
        </>
      );
  }
}

export function CourtArt({ sport, className = "" }: { sport: SportSlug; className?: string }) {
  const [from, to] = FLOOR[sport];
  // Unique per instance: several cards of the same sport can share a page.
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={`url(#${gradientId})`} />
      <g fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" strokeLinejoin="round">
        <Lines sport={sport} />
      </g>
    </svg>
  );
}
