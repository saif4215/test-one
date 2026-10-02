(() => {
  const C = window.CAFE;
  const $ = (s, r = document) => r.querySelector(s);
  const money = n => "$" + n.toFixed(2);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const TAGS = { v: "Vegetarian", vg: "Vegan", gf: "Gluten-free", spicy: "Spicy", pop: "Popular", new: "New" };
  const DIETS = ["vg", "v", "gf"];
  const GRADS = ["#f6d9b0,#e9a86a", "#e6cfb8,#b98563", "#f3e2c4,#d6a86a", "#dfe8d2,#a9c48a", "#f2d4cf,#d89a8f", "#e0d3ea,#b79ccf"];
  const grad = i => `linear-gradient(135deg,${GRADS[i % GRADS.length].split(",").join(",")})`;

  const state = { cat: "all", q: "", diet: new Set(), cart: {} };
  try { state.cart = JSON.parse(localStorage.getItem("maruf-cart") || "{}"); } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem("maruf-cart", JSON.stringify(state.cart)); } catch { /* ignore */ } };
  const byId = Object.fromEntries(C.menu.map(m => [m.id, m]));
  Object.keys(state.cart).forEach(id => { if (!byId[id]) delete state.cart[id]; });

  /* ---------- theme ---------- */
  const root = document.documentElement;
  let theme = null;
  try { theme = localStorage.getItem("maruf-theme"); } catch { /* ignore */ }
  if (!theme) theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  root.dataset.theme = theme;
  $("#theme").onclick = () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("maruf-theme", root.dataset.theme); } catch { /* ignore */ }
  };

  /* ---------- static content ---------- */
  document.title = `${C.name} — Coffee, Breakfast & Bakery`;
  $("#hero-title").textContent = C.tagline;
  $("#year").textContent = new Date().getFullYear();
  $("#address").textContent = C.address;
  const tel = "tel:" + C.phone.replace(/[^\d+]/g, "");
  $("#phone-link").textContent = C.phone; $("#phone-link").href = tel;
  $("#dir-link").href = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(C.mapQuery);
  $("#map").src = "https://www.google.com/maps?q=" + encodeURIComponent(C.mapQuery) + "&output=embed";
  $("#foot-contact").textContent = `${C.address} · ${C.phone}`;
  if (C.heroImage) {
    const h = $("#hero-bg"); h.style.backgroundImage = `url("${C.heroImage}")`; h.classList.add("has-img");
  }
  if (C.externalOrderUrl) {
    const o = $("#order-cta"); o.href = C.externalOrderUrl; o.target = "_blank"; o.rel = "noopener";
  }

  /* ---------- hours & open/closed ---------- */
  const fmt12 = t => { const [h, m] = t.split(":").map(Number); return `${(h % 12) || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
  function nowInCafe() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t).value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    return { day, mins: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
  }
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  function renderHours() {
    const { day, mins } = nowInCafe();
    $("#hours").innerHTML = "<caption class='sr'>Opening hours</caption>" + DAYS.map((d, i) => {
      const h = C.hours[i];
      return `<tr class="${i === day ? "today" : ""}"><td>${d}</td><td>${h ? fmt12(h[0]) + " – " + fmt12(h[1]) : "Closed"}</td></tr>`;
    }).join("");
    const today = C.hours[day], el = $("#status");
    let msg = "", cls = "closed";
    if (today && mins >= toMin(today[0]) && mins < toMin(today[1])) {
      cls = "open";
      const left = toMin(today[1]) - mins;
      msg = left <= 60 ? `Open now · closing in ${left} min` : `Open now · until ${fmt12(today[1])}`;
    } else {
      let next = null;
      for (let k = 0; k < 8 && !next; k++) {
        const d = (day + k) % 7, h = C.hours[d];
        if (h && (k > 0 || mins < toMin(h[0]))) next = { k, d, h };
      }
      msg = next ? `Closed · opens ${next.k === 0 ? "today" : next.k === 1 ? "tomorrow" : DAYS[next.d]} at ${fmt12(next.h[0])}` : "Closed";
    }
    el.className = "status " + cls;
    el.innerHTML = `<i></i>${esc(msg)}`;
  }
  renderHours(); setInterval(renderHours, 60000);

  /* ---------- pictures ---------- */
  // Real photo if `img` is set (falls back gracefully if it fails to load), otherwise a styled illustration tile.
  function pic(img, emoji, i, alt) {
    const fallback = `<span class="emoji" aria-hidden="true">${emoji}</span>`;
    return `<div class="pic" style="background:${grad(i)}" data-fallback='${fallback}'>${img ? `<img src="${esc(img)}" alt="${esc(alt)}" loading="lazy">` : fallback}</div>`;
  }
  document.addEventListener("error", e => {
    const t = e.target;
    if (t.tagName === "IMG" && t.parentElement?.dataset.fallback) t.parentElement.innerHTML = t.parentElement.dataset.fallback;
  }, true);

  /* ---------- menu ---------- */
  function renderTabs() {
    const all = [{ id: "all", name: "All" }, ...C.categories];
    $("#tabs").innerHTML = all.map(c => `<button class="tab" role="tab" aria-selected="${state.cat === c.id}" data-cat="${c.id}">${esc(c.name)}</button>`).join("");
    $("#diet").innerHTML = DIETS.map(d => `<button class="chip" aria-pressed="${state.diet.has(d)}" data-d="${d}">${TAGS[d]}</button>`).join("");
  }
  function card(m, idx) {
    const q = state.cart[m.id] || 0;
    const action = q
      ? `<div class="qty"><button data-dec="${m.id}" aria-label="Remove one ${esc(m.name)}">−</button><b aria-live="polite">${q}</b><button data-inc="${m.id}" aria-label="Add one ${esc(m.name)}">+</button></div>`
      : `<button class="add" data-add="${m.id}">Add · ${money(m.price)}</button>`;
    return `<article class="card">${pic(m.img, m.emoji, idx, m.name)}<div class="card-b">
      <div class="row-t"><h3>${esc(m.name)}</h3><span class="price">${money(m.price)}</span></div>
      <p class="desc">${esc(m.desc)}</p>
      <div class="tags">${m.tags.map(t => `<span class="tag ${t}">${TAGS[t]}</span>`).join("")}</div>${action}</div></article>`;
  }
  function renderMenu() {
    const q = state.q.trim().toLowerCase();
    const match = m =>
      (state.cat === "all" || m.cat === state.cat) &&
      [...state.diet].every(d => m.tags.includes(d) || (d === "v" && m.tags.includes("vg"))) &&
      (!q || (m.name + " " + m.desc + " " + m.tags.map(t => TAGS[t]).join(" ")).toLowerCase().includes(q));
    let html = "", total = 0;
    C.categories.forEach(c => {
      const items = C.menu.filter(m => m.cat === c.id && match(m));
      if (!items.length) return;
      total += items.length;
      html += `<h3 class="cat-title">${esc(c.name)}</h3><div class="grid">${items.map(m => card(m, C.menu.indexOf(m))).join("")}</div>`;
    });
    $("#menu-list").innerHTML = html;
    $("#empty").hidden = total > 0;
  }
  $("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (b) { state.cat = b.dataset.cat; renderTabs(); renderMenu(); } });
  $("#diet").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) { state.diet.has(b.dataset.d) ? state.diet.delete(b.dataset.d) : state.diet.add(b.dataset.d); renderTabs(); renderMenu(); } });
  $("#search").addEventListener("input", e => { state.q = e.target.value; renderMenu(); });
  $("#menu-list").addEventListener("click", e => {
    const t = e.target.closest("[data-add],[data-inc],[data-dec]"); if (!t) return;
    const id = t.dataset.add || t.dataset.inc || t.dataset.dec;
    change(id, t.dataset.dec ? -1 : 1);
    if (t.dataset.add) toast(`${byId[id].name} added`);
    const focus = t.dataset.add ? `[data-inc="${id}"]` : (state.cart[id] ? `[data-${t.dataset.inc ? "inc" : "dec"}="${id}"]` : `[data-add="${id}"]`);
    $(focus)?.focus();
  });

  /* ---------- gallery / reviews ---------- */
  const gEmoji = ["☕", "🥐", "🪴", "🍰", "🫘", "🌿"];
  $("#gallery-grid").innerHTML = gEmoji.map((e, i) => `<div class="g" style="background:${grad(i + 2)}" data-fallback='<span aria-hidden="true">${e}</span>'>${C.gallery[i] ? `<img src="${esc(C.gallery[i])}" alt="Maruf Cafe photo ${i + 1}" loading="lazy">` : `<span aria-hidden="true">${e}</span>`}</div>`).join("");
  $("#review-list").innerHTML = C.reviews.map(r => `<figure class="review"><div class="stars" role="img" aria-label="${r.stars} out of 5 stars">${"★".repeat(r.stars)}</div><p>“${esc(r.text)}”</p><figcaption><cite>${esc(r.name)}</cite></figcaption></figure>`).join("");

  /* ---------- cart ---------- */
  function change(id, d) {
    const n = (state.cart[id] || 0) + d;
    if (n <= 0) delete state.cart[id]; else state.cart[id] = Math.min(n, 20);
    save(); renderMenu(); renderCart();
  }
  function totals() {
    const items = Object.entries(state.cart).map(([id, q]) => ({ ...byId[id], q }));
    const sub = items.reduce((s, i) => s + i.price * i.q, 0);
    const delivery = $("#checkout [name=type]:checked").value === "delivery";
    const fee = delivery && sub < C.freeDeliveryOver ? C.deliveryFee : 0;
    const tax = Math.round(sub * C.taxRate * 100) / 100;
    return { items, sub, delivery, fee, tax, total: sub + fee + tax, count: items.reduce((s, i) => s + i.q, 0) };
  }
  function renderCart() {
    const t = totals();
    $("#cart-count").textContent = t.count;
    $("#open-cart").setAttribute("aria-label", `Open order, ${t.count} item${t.count === 1 ? "" : "s"}`);
    $("#sticky-cart").hidden = !t.count || !$("#drawer").hidden;
    $("#sticky-count").textContent = `${t.count} item${t.count === 1 ? "" : "s"}`;
    $("#sticky-total").textContent = money(t.sub);
    $("#cart-empty").hidden = t.count > 0;
    $("#checkout").hidden = !t.count || !$("#done").hidden;
    $("#lines").hidden = !$("#done").hidden;
    $("#lines").innerHTML = t.items.map(i => `<li class="line"><b>${esc(i.name)}</b><span class="lp">${money(i.price * i.q)}</span>
      <div class="qty"><button data-dec="${i.id}" aria-label="Remove one ${esc(i.name)}">−</button><b>${i.q}</b><button data-inc="${i.id}" aria-label="Add one ${esc(i.name)}">+</button></div><span></span></li>`).join("");
    $("#t-sub").textContent = money(t.sub);
    $("#t-del-row").hidden = !t.delivery;
    $("#t-del").textContent = t.fee ? money(t.fee) : "Free";
    $("#t-tax").textContent = money(t.tax);
    $("#t-total").textContent = money(t.total);
    $("#addr-row").hidden = !t.delivery;
    $("#checkout [name=address]").required = t.delivery;
  }
  $("#lines").addEventListener("click", e => { const t = e.target.closest("[data-inc],[data-dec]"); if (t) change(t.dataset.inc || t.dataset.dec, t.dataset.dec ? -1 : 1); });
  $("#checkout").addEventListener("change", renderCart);
  $("#clear").onclick = () => { if (confirm("Clear your whole order?")) { state.cart = {}; save(); renderMenu(); renderCart(); } };

  let lastFocus = null;
  function openCart() {
    if (C.externalOrderUrl) { window.open(C.externalOrderUrl, "_blank", "noopener"); return; }
    lastFocus = document.activeElement;
    $("#done").hidden = true; $("#drawer").hidden = false; $("#scrim").hidden = false; renderCart();
    $("#close-cart").focus(); document.body.style.overflow = "hidden";
  }
  function closeCart() {
    $("#drawer").hidden = true; $("#scrim").hidden = true; document.body.style.overflow = ""; renderCart(); lastFocus?.focus();
  }
  $("#open-cart").onclick = openCart; $("#sticky-cart").onclick = openCart;
  $("#close-cart").onclick = closeCart; $("#scrim").onclick = closeCart;
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#drawer").hidden) closeCart();
    if (e.key === "Tab" && !$("#drawer").hidden) { // keep focus inside the dialog
      const f = [...$("#drawer").querySelectorAll("button,input,textarea,a[href]")].filter(x => !x.closest("[hidden]") && !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  $("#checkout").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target), t = totals();
    const lines = [`New ${f.get("type")} order — ${C.name}`, `Name: ${f.get("name")}`, `Phone: ${f.get("phone")}`];
    if (t.delivery) lines.push(`Address: ${f.get("address")}`);
    lines.push("", ...t.items.map(i => `${i.q} x ${i.name} — ${money(i.price * i.q)}`), "");
    if (f.get("notes")) lines.push(`Notes: ${f.get("notes")}`, "");
    lines.push(`Subtotal ${money(t.sub)}`, ...(t.delivery ? [`Delivery ${t.fee ? money(t.fee) : "Free"}`] : []), `Tax ${money(t.tax)}`, `TOTAL ${money(t.total)}`);
    const text = lines.join("\n");
    $("#done-text").value = text;
    $("#done-msg").textContent = C.orderSms
      ? "Tap “Text it to us” to send this to the cafe. We'll confirm by text."
      : "Copy this and send it to the cafe, or call us to confirm.";
    const sms = $("#sms"); sms.hidden = !C.orderSms;
    if (C.orderSms) sms.href = `sms:${C.orderSms}?&body=${encodeURIComponent(text)}`;
    $("#checkout").hidden = true; $("#lines").hidden = true; $("#done").hidden = false;
  });
  $("#copy").onclick = async () => {
    const ta = $("#done-text");
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand("copy"); }
    toast("Order copied");
  };
  $("#back").onclick = () => { $("#done").hidden = true; renderCart(); };

  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 1600); }

  /* ---------- SEO structured data ---------- */
  $("#jsonld").textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: C.name, telephone: C.phone, address: C.address, servesCuisine: "Coffee, Breakfast, Bakery",
    openingHoursSpecification: Object.entries(C.hours).filter(([, h]) => h).map(([d, h]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS[d], opens: h[0], closes: h[1] })),
  });

  renderTabs(); renderMenu(); renderCart();
})();
