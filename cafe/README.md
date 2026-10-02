# Maruf Cafe website

A standalone, dependency-free static site (HTML/CSS/JS). Separate from the Amazon app in the repo root.

- **Run locally:** `cd cafe && python3 -m http.server 8000`, then open http://localhost:8000
- **Deploy:** upload the `cafe/` folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, S3).
- **Edit content:** everything lives in `site-data.js`: name, address, phone, hours, menu, prices, option groups,
  social links, photos, reviews.

## Before launch
1. Replace the placeholder menu, prices, address, phone and hours in `site-data.js`.
2. Set `isPlaceholder: false` (removes the preview banner and turns on search-engine markup).
3. Add real photos (below) and real reviews. The gallery and reviews sections stay hidden until you add some.
4. Set `orderSms` (a number that receives order texts) or `externalOrderUrl` (Square/Toast ordering page).

## Photos
Set `heroImage`, `gallery[]` and per-item `img` (e.g. `img/latte.jpg`, saved in `cafe/img/`). Items without a photo
show a hand-drawn illustration (`illustrations.js`). Only use photos you own or are licensed to use.

## Features
- Live open/closed status in the cafe's timezone, hours table with today highlighted, map and directions
- Menu with sticky category tabs, search, vegan/vegetarian/gluten-free filters, customer-favorites strip
- Item customization (size, milk, extras, add-ons) with live pricing and quantity
- Cart saved in the browser; pickup or delivery, ASAP or scheduled slots (or next opening when closed),
  delivery fee/minimum, tax, validation; order text to copy or SMS
- Instagram and TikTok QR codes (`instagram-qr.svg`, `tiktok-qr.svg`)
- Dark mode, keyboard-accessible dialogs with focus trap, reduced-motion support, mobile-first layout
