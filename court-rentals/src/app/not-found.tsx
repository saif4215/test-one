import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">That court isn&apos;t here</h1>
      <p className="mt-3 text-muted">
        The link may be out of date, or the listing has been removed.
      </p>
      <Link
        href="/rentals"
        className="mt-6 inline-block rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-ink hover:opacity-90"
      >
        Browse all courts
      </Link>
    </div>
  );
}
