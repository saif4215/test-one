import { SORTS, SPORTS, cities, type Filters } from "../lib/listings";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted";
const label = "mb-1 block text-xs font-medium text-muted";

/**
 * A plain GET form, so it works without JavaScript and every search is a shareable URL.
 * The browser submits empty fields as `sport=&city=`; parseFilters drops those.
 */
export function SearchForm({ filters, advanced = false }: { filters: Filters; advanced?: boolean }) {
  return (
    <form
      action="/rentals"
      method="get"
      className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm lg:grid-cols-4"
    >
      <div>
        <label htmlFor="sport" className={label}>
          Sport
        </label>
        <select id="sport" name="sport" defaultValue={filters.sport ?? ""} className={field}>
          <option value="">All sports</option>
          {SPORTS.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.short}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="city" className={label}>
          City
        </label>
        <select id="city" name="city" defaultValue={filters.city ?? ""} className={field}>
          <option value="">Anywhere</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {advanced ? (
        <>
          <div className="col-span-2 lg:col-span-1">
            <label htmlFor="q" className={label}>
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              placeholder="Name, neighborhood, surface…"
              maxLength={80}
              className={field}
            />
          </div>

          <div>
            <label htmlFor="maxRate" className={label}>
              Max price per hour
            </label>
            <input
              id="maxRate"
              name="maxRate"
              type="number"
              min={1}
              step={5}
              inputMode="numeric"
              defaultValue={filters.maxRate ?? ""}
              placeholder="Any"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="setting" className={label}>
              Indoor / outdoor
            </label>
            <select id="setting" name="setting" defaultValue={filters.setting ?? ""} className={field}>
              <option value="">Either</option>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>

          <div>
            <label htmlFor="sort" className={label}>
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={filters.sort} className={field}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      <div className={`flex items-end ${advanced ? "" : "col-span-2 lg:col-span-1"}`}>
        <button
          type="submit"
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-opacity hover:opacity-90"
        >
          Search courts
        </button>
      </div>
    </form>
  );
}
