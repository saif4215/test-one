/*
 * ====== EDIT THIS FILE FIRST ======
 * Everything below is PLACEHOLDER content. Replace it with Maruf Cafe's real
 * details (name, address, phone, hours, menu, prices) before going live.
 */
window.CAFE = {
  name: "Maruf Cafe",
  tagline: "Fresh coffee, warm food, good company.",
  address: "123 Example Street, Staten Island, NY 10301",
  phone: "(718) 555-0123",
  email: "hello@example.com",
  // Where order text messages are sent (digits only). Leave "" to use copy-to-clipboard only.
  orderSms: "",
  // If you use a real online-ordering page (Square, Toast, ...), put its URL here and
  // the "Order online" buttons will point to it instead of the built-in cart.
  externalOrderUrl: "",
  timezone: "America/New_York",
  taxRate: 0.08875,
  deliveryFee: 3.0,
  freeDeliveryOver: 30,
  social: { instagram: "https://www.instagram.com/maruf.cafe/", facebook: "" },
  // PHOTOS: put image URLs or files (e.g. "img/hero.jpg") here. Empty = styled illustration fallback.
  // Menu items can also take an `img: "img/latte.jpg"` field. Only use photos you own or are licensed to use
  // (your own shots, or free-licence sites such as Unsplash/Pexels with their terms followed).
  heroImage: "",
  gallery: ["", "", "", "", "", ""],
  mapQuery: "123 Example Street, Staten Island, NY 10301",
  // 0 = Sunday ... 6 = Saturday. [open, close] in 24h "HH:MM", or null for closed.
  hours: {
    0: ["08:00", "17:00"],
    1: ["07:00", "19:00"],
    2: ["07:00", "19:00"],
    3: ["07:00", "19:00"],
    4: ["07:00", "19:00"],
    5: ["07:00", "21:00"],
    6: ["08:00", "21:00"],
  },
  // tags: v = vegetarian, vg = vegan, gf = gluten-free, spicy, pop = popular, new
  categories: [
    { id: "coffee", name: "Coffee & Espresso" },
    { id: "tea", name: "Tea & Cold Drinks" },
    { id: "breakfast", name: "Breakfast" },
    { id: "lunch", name: "Lunch" },
    { id: "bakery", name: "Bakery & Sweets" },
  ],
  menu: [
    { id: "esp", cat: "coffee", name: "Espresso", desc: "Double shot, rich and syrupy.", price: 3.25, emoji: "☕", tags: ["vg", "gf"] },
    { id: "lat", cat: "coffee", name: "Latte", desc: "Silky steamed milk over espresso. Hot or iced.", price: 4.75, emoji: "🥛", tags: ["v", "gf", "pop"] },
    { id: "cap", cat: "coffee", name: "Cappuccino", desc: "Equal parts espresso, milk and foam.", price: 4.5, emoji: "☕", tags: ["v", "gf"] },
    { id: "mocha", cat: "coffee", name: "Mocha", desc: "Espresso, dark chocolate, steamed milk.", price: 5.25, emoji: "🍫", tags: ["v", "gf"] },
    { id: "cold", cat: "coffee", name: "Cold Brew", desc: "Steeped 18 hours. Smooth, never bitter.", price: 4.5, emoji: "🧊", tags: ["vg", "gf", "pop"] },
    { id: "karak", cat: "tea", name: "Spiced Milk Tea", desc: "Strong black tea simmered with cardamom and ginger.", price: 4.0, emoji: "🫖", tags: ["v", "gf", "new"] },
    { id: "matcha", cat: "tea", name: "Iced Matcha Latte", desc: "Ceremonial-grade matcha, your choice of milk.", price: 5.5, emoji: "🍵", tags: ["v", "gf"] },
    { id: "lemon", cat: "tea", name: "Fresh Mint Lemonade", desc: "Squeezed to order with garden mint.", price: 4.25, emoji: "🍋", tags: ["vg", "gf"] },
    { id: "bagel", cat: "breakfast", name: "Egg & Cheese Bagel", desc: "Toasted bagel, fluffy egg, melted cheddar.", price: 6.5, emoji: "🥯", tags: ["v", "pop"] },
    { id: "avo", cat: "breakfast", name: "Avocado Toast", desc: "Sourdough, smashed avocado, chili flakes, lemon.", price: 8.75, emoji: "🥑", tags: ["vg", "spicy"] },
    { id: "oat", cat: "breakfast", name: "Berry Oatmeal Bowl", desc: "Steel-cut oats, seasonal berries, honey.", price: 7.25, emoji: "🫐", tags: ["v", "gf"] },
    { id: "chicken", cat: "lunch", name: "Grilled Chicken Panini", desc: "Pesto, mozzarella, roasted peppers.", price: 11.5, emoji: "🥪", tags: ["pop"] },
    { id: "falafel", cat: "lunch", name: "Falafel Wrap", desc: "Crispy falafel, tahini, pickles, fresh greens.", price: 10.25, emoji: "🌯", tags: ["vg"] },
    { id: "soup", cat: "lunch", name: "Soup of the Day", desc: "Made fresh each morning. Ask at the counter.", price: 6.5, emoji: "🍲", tags: ["gf"] },
    { id: "crois", cat: "bakery", name: "Butter Croissant", desc: "Flaky, golden, baked every morning.", price: 3.95, emoji: "🥐", tags: ["v", "pop"] },
    { id: "muffin", cat: "bakery", name: "Blueberry Muffin", desc: "Big, tender, studded with berries.", price: 3.75, emoji: "🧁", tags: ["v"] },
    { id: "cookie", cat: "bakery", name: "Chocolate Chunk Cookie", desc: "Crisp edges, gooey middle, sea salt.", price: 3.25, emoji: "🍪", tags: ["v"] },
    { id: "baklava", cat: "bakery", name: "Pistachio Baklava", desc: "Honey-soaked layers of phyllo and pistachio.", price: 4.5, emoji: "🍯", tags: ["v", "new"] },
  ],
  reviews: [
    { name: "Placeholder Reviewer", stars: 5, text: "Replace these with real customer reviews from Google or Yelp." },
    { name: "Another Customer", stars: 5, text: "Short, honest quotes work best. Link to your Google reviews page." },
    { name: "Regular Guest", stars: 5, text: "Featured reviews build trust faster than any slogan." },
  ],
};
