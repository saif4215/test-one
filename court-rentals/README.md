# CourtLane — court rental marketplace

A small Next.js 16 site for browsing and requesting hourly court rentals (basketball, pickleball, volleyball, tennis, futsal).
It is **independent of the Amazon-reselling app** in the repo root: its own `package.json`, its own dependencies, nothing shared.

> The 12 listings in `src/lib/listings.ts` are **invented sample data**, and the site shows a "Demo site" banner while
> `demoData` is `true` in `src/lib/site.ts`. Replace the data and flip that flag before launching.

## Run it

```bash
cd court-rentals
npm install
npm run dev        # http://localhost:3000
```

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Dev server                                  |
| `npm run build`     | Production build (prerenders every listing) |
| `npm start`         | Serve the production build                  |
| `npm test`          | Unit tests for URLs, filters and data       |
| `npm run typecheck` | TypeScript                                  |
| `npm run lint`      | ESLint                                      |

## Make it yours

1. **Name, tagline, contact email:** `src/lib/site.ts`. Booking requests and "List your space" open an email to `contactEmail`
   (currently the placeholder `hello@example.com`).
2. **Listings:** edit the `listings` array in `src/lib/listings.ts`. Add a sport by adding an entry to `SPORTS`
   and a drawing for it in `src/components/CourtArt.tsx`.
3. **Colors:** the tokens at the top of `src/app/globals.css` (light and dark).

## Routes

| URL                              | Page                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| `/`                              | Home: search, browse by sport, featured listings                  |
| `/rentals`                       | All listings; filter with `?sport=&city=&q=&maxRate=&setting=&sort=` |
| `/rentals/<sport>/<slug>`        | One listing, e.g. `/rentals/basketball/harbor-street-gym-court-a` |

Every listing link is built by `listingPath()`, so a missing value can't produce a URL like `/undefined/…`. Unknown
or mismatched URLs return a 404 page. Query strings are validated by `parseFilters()`; bad values are ignored.

## What is not built yet

- No accounts, calendar availability, payments or host dashboard. "Request to book" is a prefilled `mailto:` link.
- No database; listings live in code. Move them to a DB when there are more than a few dozen.
- No real photos; each listing shows a generated court drawing.

## Notes for working in this repo

- This app pins `turbopack.root` in `next.config.ts`. Without it, Next sees the repo-root `package-lock.json`, treats the
  repo root as the workspace and picks up the other app's files.
- It uses relative imports (no `@/` alias) and no `PageProps`/`RouteContext` globals, because the repo-root
  `tsconfig.json` also includes this folder's files.
- Building here creates `court-rentals/.next/`, which the repo-root `eslint` does not ignore. Delete it before linting
  the root app, or add `court-rentals/**` to the root ESLint ignores.
- Next.js 16 differs from older versions (async `params`/`searchParams`, opt-in Cache Components). The docs for the
  installed version are in `node_modules/next/dist/docs/`.
