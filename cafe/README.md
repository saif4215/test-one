# Maruf Cafe website

A standalone, dependency-free static site (HTML/CSS/JS). Separate from the Amazon app in the repo root.

- **Run locally:** `cd cafe && python3 -m http.server 8000`, then open http://localhost:8000
- **Deploy:** upload the `cafe/` folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, S3).
- **Edit content:** everything (name, address, phone, hours, menu, prices, reviews, photos) lives in `site-data.js`.

## Replace the placeholders
All text, prices, address, phone and reviews are placeholders. Update `site-data.js` before launch.

## Photos
Set `heroImage`, `gallery[]` and per-item `img` in `site-data.js` (e.g. `img/latte.jpg`, saved in `cafe/img/`).
Anything left blank shows an illustrated tile. Only use photos you own or are licensed to use.

## Features
Live open/closed status (cafe timezone), category tabs, search, vegan/vegetarian/gluten-free filters,
cart with pickup/delivery totals saved in the browser, order text to copy or SMS, dark mode, keyboard-accessible
cart dialog, mobile-first layout, SEO metadata and schema.org markup. To use a real ordering platform instead of
the built-in cart, set `externalOrderUrl`.
