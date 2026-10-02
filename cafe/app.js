(() => {
  const C = window.CAFE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const r2 = n => Math.round(n * 100) / 100;
  const money = n => "$" + r2(n).toFixed(2);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const TAGS = { v: "Vegetarian", vg: "Vegan", gf: "Gluten-free", spicy: "Spicy", pop: "Popular", new: "New" };
  const DIETS = ["vg", "v", "gf"];
  const GRADS = [["#f8e0bd", "#eab27a"], ["#ead8c4", "#c29473"], ["#f5e6c8", "#dcb176"], ["#e3ecd7", "#b3cc95"], ["#f5dbd5", "#dca396"], ["#e5daee", "#bfa6d4"]];
  const grad = i => `linear-gradient(135deg,${GRADS[i % GRADS.length][0]},${GRADS[i % GRADS.length][1]})`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  const byId = Object.fromEntries(C.menu.map(m => [m.id, m]));
  const groups = m => (m.groups || []).map(g => ({ id: g, ...C.optionGroups[g] })).filter(g => g.choices);

  /* ---------- state ---------- */
  const state = { cat: "all", q: "", diet: new Set(), cart: [], opt: null };
  try { state.cart = JSON.parse(store.get("maruf-cart-v2") || "[]").filter(l => byId[l.id]); } catch { state.cart = []; }
  const save = () => store.set("maruf-cart-v2", JSON.stringify(state.cart));

  /* ---------- theme ---------- */
  const root = document.documentElement;
  root.dataset.theme = store.get("maruf-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  $("#theme").onclick = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; store.set("maruf-theme", root.dataset.theme); };

  /* ---------- static content ---------- */
  document.title = C.name;
  $("#hero-title").textContent = C.tagline;
  $("#year").textContent = new Date().getFullYear();
  $("#about-text").textContent = C.about;
  $("#address").textContent = C.address;
  const tel = "tel:" + C.phone.replace(/[^\d+]/g, "");
  const dirUrl = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(C.mapQuery);
  $("#phone-link").textContent = C.phone; $("#phone-link").href = tel;
  $("#call-cta").href = tel; $("#call-done").href = tel;
  $("#dir-link").href = dirUrl; $("#dir-cta").href = dirUrl;
  $("#map").src = "https://www.google.com/maps?q=" + encodeURIComponent(C.mapQuery) + "&output=embed";
  $("#foot-contact").textContent = `${C.address} · ${C.phone}`;
  $("#facts").innerHTML = C.facts.map(([a, b]) => `<li><strong>${esc(a)}</strong><span>${esc(b)}</span></li>`).join("");
  if (C.isPlaceholder) $("#banner").hidden = false;
  if (C.announcement) { $("#announce").textContent = C.announcement; $("#announce").hidden = false; }
  if (C.heroImage) { const h = $("#hero-bg"); h.style.backgroundImage = `url("${esc(C.heroImage)}")`; h.classList.add("has-img"); }
  if (C.externalOrderUrl) { const o = $("#order-cta"); o.href = C.externalOrderUrl; o.target = "_blank"; o.rel = "noopener"; }

  const showSection = (id, on) => { $("#" + id).hidden = !on; const l = $(`.links [data-for="${id}"]`); if (l) l.hidden = !on; };
  const socials = [["instagram", "insta", "Instagram"], ["tiktok", "tiktok", "TikTok"]].filter(([k]) => C.social?.[k]);
  socials.forEach(([k, id, label]) => {
    $("#" + id).hidden = false; $("#" + id + "-link").href = C.social[k];
    $("#foot-links").insertAdjacentHTML("beforeend", `<a href="${esc(C.social[k])}" target="_blank" rel="noopener">${label}</a>`);
  });
  showSection("follow", socials.length > 0);
  showSection("gallery", C.gallery.length > 0);
  showSection("reviews", C.reviews.length > 0);
  $("#gallery-grid").innerHTML = C.gallery.map((src, i) => `<div class="g" style="background:${grad(i + 2)}"><img src="${esc(src)}" alt="Maruf Cafe photo ${i + 1}" loading="lazy"></div>`).join("");
  $("#review-list").innerHTML = C.reviews.map(r => `<figure class="review"><div class="stars" role="img" aria-label="${r.stars} out of 5 stars">${"★".repeat(r.stars)}</div><p>“${esc(r.text)}”</p><figcaption><cite>${esc(r.name)}</cite></figcaption></figure>`).join("");

  /* ---------- hours ---------- */
  const fmtMin = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${(h % 12) || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fmt12 = t => fmtMin(toMin(t));
  function nowInCafe() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t).value;
    return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), mins: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
  }
  // Next opening time. `skipToday` = ignore any opening later today (used when too close to closing).
  function nextOpen(day, mins, skipToday) {
    for (let k = skipToday ? 1 : 0; k < 8; k++) {
      const d = (day + k) % 7, h = C.hours[d];
      if (h && (k > 0 || mins < toMin(h[0]))) return { k, d, at: fmt12(h[0]), label: `${k === 0 ? "today" : k === 1 ? "tomorrow" : DAYS[d]} at ${fmt12(h[0])}` };
    }
    return null;
  }
  const isOpen = (day, mins) => { const h = C.hours[day]; return !!h && mins >= toMin(h[0]) && mins < toMin(h[1]); };
  function renderHours() {
    const { day, mins } = nowInCafe();
    $("#hours").innerHTML = "<caption class='sr'>Opening hours</caption>" + DAYS.map((d, i) => {
      const h = C.hours[i];
      return `<tr class="${i === day ? "today" : ""}"><td>${d}</td><td>${h ? fmt12(h[0]) + " – " + fmt12(h[1]) : "Closed"}</td></tr>`;
    }).join("");
    let msg, cls;
    if (isOpen(day, mins)) {
      cls = "open"; const left = toMin(C.hours[day][1]) - mins;
      msg = left <= 60 ? `Open now · closing in ${left} min` : `Open now · until ${fmt12(C.hours[day][1])}`;
    } else {
      cls = "closed"; const n = nextOpen(day, mins);
      msg = n ? `Closed · opens ${n.label}` : "Closed";
    }
    $("#status").className = "status " + cls;
    $("#status").innerHTML = `<i></i>${esc(msg)}`;
  }
  renderHours(); setInterval(renderHours, 60000);

  /* ---------- pricing / options ---------- */
  function defaults(m) { const sel = {}; groups(m).forEach(g => { sel[g.id] = g.type === "one" ? [g.choices[0].name] : []; }); return sel; }
  function unit(m, sel) {
    let p = m.price;
    groups(m).forEach(g => (sel[g.id] || []).forEach(n => { const c = g.choices.find(c => c.name === n); if (c) p += c.price; }));
    return r2(p);
  }
  const selText = (m, sel) => groups(m).flatMap(g => sel[g.id] || []).join(", ");
  const lineKey = (m, sel) => m.id + "|" + groups(m).map(g => (sel[g.id] || []).join("+")).join("|");
  function addLine(id, sel, q) {
    const m = byId[id], key = lineKey(m, sel), ex = state.cart.find(l => l.key === key);
    if (ex) ex.q = Math.min(ex.q + q, 20); else state.cart.push({ key, id, sel, q: Math.min(q, 20) });
    save(); updateBadges(); renderCart();
  }
  function changeLine(key, d) {
    const l = state.cart.find(l => l.key === key); if (!l) return;
    l.q += d; if (l.q <= 0) state.cart = state.cart.filter(x => x !== l); else l.q = Math.min(l.q, 20);
    save(); updateBadges(); renderCart();
  }
  const countOf = id => state.cart.filter(l => l.id === id).reduce((s, l) => s + l.q, 0);

  /* ---------- pictures ---------- */
  function pic(m, i) {
    const art = m.img ? `<img src="${esc(m.img)}" alt="${esc(m.name)}" loading="lazy">` : window.illus(m.kind, m.tint);
    return `<div class="pic" style="background:${grad(i)}" data-art='${esc(window.illus(m.kind, m.tint))}'>${art}<span class="badge" data-count="${m.id}" hidden></span></div>`;
  }
  document.addEventListener("error", e => {
    const t = e.target;
    if (t.tagName === "IMG" && t.parentElement?.dataset.art) {
      const badge = t.parentElement.querySelector(".badge");
      t.parentElement.innerHTML = t.parentElement.dataset.art; if (badge) t.parentElement.appendChild(badge);
    }
  }, true);

  /* ---------- menu ---------- */
  function card(m) {
    const custom = groups(m).length > 0, i = C.menu.indexOf(m);
    return `<article class="card">${pic(m, i)}<div class="card-b">
      <div class="row-t"><h3>${esc(m.name)}</h3></div>
      <p class="desc">${esc(m.desc)}</p>
      <div class="tags">${m.tags.map(t => `<span class="tag ${t}">${TAGS[t]}</span>`).join("")}</div>
      <div class="card-f"><span class="price">${money(m.price)}</span>
      <button class="add" data-add="${m.id}" aria-label="${custom ? "Customize" : "Add"} ${esc(m.name)}">${custom ? "Customize" : "Add"}</button></div></div></article>`;
  }
  function renderChrome() {
    const all = [{ id: "all", name: "All" }, ...C.categories];
    $("#tabs").innerHTML = all.map(c => `<button class="tab" aria-pressed="${state.cat === c.id}" data-cat="${c.id}">${esc(c.name)}</button>`).join("");
    $("#diet").innerHTML = DIETS.map(d => `<button class="chip" aria-pressed="${state.diet.has(d)}" data-d="${d}">${TAGS[d]}</button>`).join("");
  }
  function renderMenu() {
    const q = state.q.trim().toLowerCase();
    const match = m => (state.cat === "all" || m.cat === state.cat) &&
      [...state.diet].every(d => m.tags.includes(d) || (d === "v" && m.tags.includes("vg"))) &&
      (!q || (m.name + " " + m.desc + " " + m.tags.map(t => TAGS[t]).join(" ")).toLowerCase().includes(q));
    let html = "", total = 0;
    C.categories.forEach(c => {
      const items = C.menu.filter(m => m.cat === c.id && match(m));
      if (!items.length) return;
      total += items.length;
      html += `<h3 class="cat-title">${esc(c.name)}</h3><div class="grid">${items.map(card).join("")}</div>`;
    });
    $("#menu-list").innerHTML = html;
    $("#empty").hidden = total > 0;
    updateBadges();
  }
  function renderFavs() {
    const f = C.menu.filter(m => m.tags.includes("pop"));
    $("#favs").hidden = !f.length;
    $("#fav-list").innerHTML = f.map(card).join("");
    updateBadges();
  }
  function updateBadges() {
    $$("[data-count]").forEach(b => { const n = countOf(b.dataset.count); b.hidden = !n; b.textContent = n ? `${n} in order` : ""; });
  }
  $("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (b) { state.cat = b.dataset.cat; renderChrome(); renderMenu(); } });
  $("#diet").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) { state.diet.has(b.dataset.d) ? state.diet.delete(b.dataset.d) : state.diet.add(b.dataset.d); renderChrome(); renderMenu(); } });
  $("#search").addEventListener("input", e => { state.q = e.target.value; renderMenu(); });
  $("#reset").onclick = () => { state.q = ""; state.cat = "all"; state.diet.clear(); $("#search").value = ""; renderChrome(); renderMenu(); };
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-add]"); if (!t) return;
    const m = byId[t.dataset.add];
    if (groups(m).length) openOpt(m.id); else { addLine(m.id, {}, 1); toast(`${m.name} added`); }
  });

  /* ---------- modal plumbing ---------- */
  const stack = [], lastFocus = new Map();
  function showModal(el, focusEl) {
    lastFocus.set(el, document.activeElement); $("#toast").classList.remove("show");
    el.hidden = false; $("#scrim").hidden = false; stack.push(el); document.body.style.overflow = "hidden"; focusEl?.focus();
  }
  function hideModal(el) {
    el.hidden = true; const i = stack.indexOf(el); if (i >= 0) stack.splice(i, 1);
    if (!stack.length) { $("#scrim").hidden = true; document.body.style.overflow = ""; }
    lastFocus.get(el)?.focus(); renderCart();
  }
  $("#scrim").onclick = () => stack.length && hideModal(stack[stack.length - 1]);
  document.addEventListener("keydown", e => {
    const top = stack[stack.length - 1]; if (!top) return;
    if (e.key === "Escape") return hideModal(top);
    if (e.key !== "Tab") return;
    const f = $$("button,input,textarea,select,a[href]", top).filter(x => !x.closest("[hidden]") && !x.disabled && x.type !== "hidden" && x.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- customize dialog ---------- */
  function readSel(m) {
    const sel = {};
    groups(m).forEach(g => { sel[g.id] = $$(`[name="${g.id}"]:checked`, $("#opt-form")).map(i => i.value); });
    return sel;
  }
  function optPrice() { const m = state.opt.m; return r2(unit(m, readSel(m)) * state.opt.q); }
  function refreshOpt() { $("#opt-q").textContent = state.opt.q; $("#opt-add").textContent = `Add to order · ${money(optPrice())}`; }
  function openOpt(id) {
    const m = byId[id], d = defaults(m);
    state.opt = { m, q: 1 };
    $("#opt-title").textContent = m.name;
    $("#opt-body").innerHTML = `<p class="muted">${esc(m.desc)}</p>` + groups(m).map(g => `<fieldset class="og"><legend>${esc(g.label)}${g.type === "many" ? " <small>(optional)</small>" : ""}</legend>${g.choices.map(c =>
      `<label class="oc"><input type="${g.type === "one" ? "radio" : "checkbox"}" name="${g.id}" value="${esc(c.name)}"${d[g.id].includes(c.name) ? " checked" : ""}><span class="ot">${esc(c.name)}</span><span class="op">${c.price ? "+" + money(c.price) : ""}</span></label>`).join("")}</fieldset>`).join("");
    refreshOpt(); showModal($("#opt"), $("#opt-close"));
  }
  $("#opt-form").addEventListener("change", refreshOpt);
  $("#opt-inc").onclick = () => { state.opt.q = Math.min(20, state.opt.q + 1); refreshOpt(); };
  $("#opt-dec").onclick = () => { state.opt.q = Math.max(1, state.opt.q - 1); refreshOpt(); };
  $("#opt-close").onclick = () => hideModal($("#opt"));
  $("#opt-form").addEventListener("submit", e => {
    e.preventDefault();
    const { m, q } = state.opt; addLine(m.id, readSel(m), q);
    hideModal($("#opt")); toast(`${m.name} added`);
  });

  /* ---------- cart ---------- */
  const orderType = () => $("#checkout [name=type]:checked").value;
  function totals() {
    const items = state.cart.map(l => ({ ...l, m: byId[l.id], u: unit(byId[l.id], l.sel) }));
    const sub = r2(items.reduce((s, i) => s + i.u * i.q, 0));
    const delivery = orderType() === "delivery";
    const fee = delivery && sub < C.freeDeliveryOver ? C.deliveryFee : 0;
    const tax = r2(sub * C.taxRate);
    return { items, sub, delivery, fee, tax, total: r2(sub + fee + tax), count: items.reduce((s, i) => s + i.q, 0) };
  }
  function renderCart() {
    const t = totals(), drawerOpen = !$("#drawer").hidden, done = !$("#done").hidden;
    $("#cart-count").textContent = t.count;
    $("#open-cart").setAttribute("aria-label", `Open order, ${t.count} item${t.count === 1 ? "" : "s"}`);
    $("#sticky-cart").hidden = !t.count || stack.length > 0 || !!C.externalOrderUrl;
    $("#sticky-count").textContent = `${t.count} item${t.count === 1 ? "" : "s"}`;
    $("#sticky-total").textContent = money(t.sub);
    $("#cart-empty").hidden = t.count > 0;
    $("#checkout").hidden = !t.count || done;
    $("#lines").hidden = done;
    $("#lines").innerHTML = t.items.map(i => `<li class="line"><div><b>${esc(i.m.name)}</b>${selText(i.m, i.sel) ? `<div class="sel">${esc(selText(i.m, i.sel))}</div>` : ""}</div><span class="lp">${money(i.u * i.q)}</span>
      <div class="qty"><button type="button" data-dec="${esc(i.key)}" aria-label="Remove one ${esc(i.m.name)}">−</button><b>${i.q}</b><button type="button" data-inc="${esc(i.key)}" aria-label="Add one ${esc(i.m.name)}">+</button></div></li>`).join("");
    $("#t-sub").textContent = money(t.sub);
    $("#t-del-row").hidden = !t.delivery;
    $("#t-del").textContent = t.fee ? money(t.fee) : "Free";
    $("#t-tax").textContent = money(t.tax);
    $("#t-total").textContent = money(t.total);
    $("#addr-row").hidden = !t.delivery;
    $("#checkout [name=address]").required = t.delivery;
    const short = t.delivery && t.sub < C.minDelivery;
    const err = $("#form-err");
    if (short) { err.hidden = false; err.dataset.kind = "min"; err.textContent = `Delivery minimum is ${money(C.minDelivery)} — add ${money(C.minDelivery - t.sub)} more, or choose pickup.`; }
    else if (err.dataset.kind === "min") { err.hidden = true; err.dataset.kind = ""; }
    $("#place").disabled = short;
    if (drawerOpen && !t.count) { /* keep drawer open to show the empty state */ }
  }
  $("#lines").addEventListener("click", e => { const t = e.target.closest("[data-inc],[data-dec]"); if (t) changeLine(t.dataset.inc || t.dataset.dec, t.dataset.dec ? -1 : 1); });
  $("#checkout").addEventListener("change", renderCart); // form errors stay put until the next submit, so the button never shifts under a click
  $("#clear").onclick = () => { if (confirm("Clear your whole order?")) { state.cart = []; save(); updateBadges(); renderCart(); } };

  // "When" choices: ASAP + 15-minute slots while open, otherwise the next opening.
  function fillWhen() {
    const { day, mins } = nowInCafe(), h = C.hours[day], sel = $("#when"), opts = [];
    const closeAt = h ? toMin(h[1]) : 0;
    if (isOpen(day, mins) && closeAt - mins >= C.prepMinutes + 5) {
      opts.push([`ASAP`, `As soon as possible (~${C.prepMinutes}–${C.prepMinutes + 10} min)`]);
      for (let m = Math.ceil((mins + C.prepMinutes + 15) / 15) * 15; m <= closeAt - 5 && opts.length < 13; m += 15) opts.push([`Today at ${fmtMin(m)}`, `Today at ${fmtMin(m)}`]);
    } else {
      const n = nextOpen(day, mins, isOpen(day, mins));
      opts.push([n ? `Next opening (${n.label})` : "Next opening", n ? `We're closed — ready ${n.label}` : "We're closed"]);
    }
    sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
  }
  function openCart() {
    if (C.externalOrderUrl) { window.open(C.externalOrderUrl, "_blank", "noopener"); return; }
    $("#done").hidden = true; $("#form-err").hidden = true; $("#form-err").dataset.kind = ""; fillWhen(); renderCart();
    showModal($("#drawer"), $("#close-cart"));
  }
  $("#open-cart").onclick = openCart; $("#sticky-cart").onclick = openCart;
  $("#close-cart").onclick = () => hideModal($("#drawer"));

  $("#checkout").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target), t = totals(), err = $("#form-err");
    const phone = String(f.get("phone")).replace(/\D/g, "");
    const fail = m => { err.textContent = m; err.hidden = false; err.dataset.kind = "form"; err.scrollIntoView({ block: "nearest" }); };
    if (!String(f.get("name")).trim()) return fail("Please enter your name.");
    if (phone.length < 10) return fail("Please enter a phone number we can reach (10 digits).");
    if (t.delivery && !String(f.get("address")).trim()) return fail("Please enter a delivery address.");
    err.hidden = true; err.dataset.kind = "";
    const id = "MC-" + (Date.now() % 1e6).toString(36).toUpperCase();
    const lines = [`Order ${id} — ${C.name}`, `${t.delivery ? "Delivery" : "Pickup"}: ${f.get("when")}`, `Name: ${String(f.get("name")).trim()}`, `Phone: ${f.get("phone")}`];
    if (t.delivery) lines.push(`Address: ${String(f.get("address")).trim()}`);
    lines.push("", ...t.items.map(i => `${i.q} x ${i.m.name}${selText(i.m, i.sel) ? ` (${selText(i.m, i.sel)})` : ""} — ${money(i.u * i.q)}`), "");
    if (String(f.get("notes")).trim()) lines.push(`Notes: ${String(f.get("notes")).trim()}`, "");
    lines.push(`Subtotal ${money(t.sub)}`, ...(t.delivery ? [`Delivery ${t.fee ? money(t.fee) : "Free"}`] : []), `Tax ${money(t.tax)}`, `TOTAL ${money(t.total)}`);
    const text = lines.join("\n");
    $("#done-text").value = text;
    $("#done-msg").textContent = C.orderSms
      ? "Tap “Text it to us” to send this to the cafe. We'll confirm by text."
      : "Copy this and send it to the cafe, or call us to confirm. Your order isn't placed until we confirm.";
    $("#sms").hidden = !C.orderSms;
    if (C.orderSms) $("#sms").href = `sms:${C.orderSms}?&body=${encodeURIComponent(text)}`;
    $("#checkout").hidden = true; $("#lines").hidden = true; $("#done").hidden = false;
    $("#done").scrollIntoView({ block: "start" });
  });
  $("#copy").onclick = async () => {
    const ta = $("#done-text");
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand("copy"); }
    toast("Order copied");
  };
  $("#back").onclick = () => { $("#done").hidden = true; renderCart(); };

  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 1600); }

  /* ---------- SEO markup (withheld while content is placeholder) ---------- */
  if (!C.isPlaceholder) {
    $("#jsonld").textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: C.name, telephone: C.phone, address: C.address,
      servesCuisine: "Coffee, Breakfast, Bakery", sameAs: Object.values(C.social || {}),
      openingHoursSpecification: Object.entries(C.hours).filter(([, h]) => h).map(([d, h]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS[d], opens: h[0], closes: h[1] })),
    });
  }

  /* ---------- scroll reveal (skipped for reduced motion) ---------- */
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("js-reveal");
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(el => io.observe(el));
  }

  renderChrome(); renderMenu(); renderFavs(); renderCart();
})();
