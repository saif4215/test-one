/*
 * ====== EDIT THIS FILE FIRST ======
 * Everything below is PLACEHOLDER content (menu, prices, address, phone, hours).
 * Replace it with Maruf Cafe's real details, then set `isPlaceholder: false`.
 */
window.CAFE = {
  // While true, a small "preview" banner shows and search-engine markup is withheld.
  isPlaceholder: true,

  name: "Maruf Cafe",
  tagline: "Fresh coffee, warm food, good company.",
  about: "We keep it simple: good beans, real ingredients, and a counter where people know your name. Everything is made fresh each day — no shortcuts, no fuss.",
  announcement: "Free delivery on orders over $30",
  // Three short selling points under the hero. Keep only what is true.
  facts: [["Baked daily", "Every morning"], ["Order ahead", "Skip the line"], ["Vegan & gluten-free", "Clearly labeled"]],

  // Address taken from a single online directory listing (atly.com) - confirm it on Google Maps, add the ZIP, then keep.
  address: "365 Veterans Rd W, Staten Island, NY",
  mapQuery: "Maruf Cafe, 365 Veterans Rd W, Staten Island, NY",
  phone: "(718) 555-0123",
  email: "hello@example.com",
  timezone: "America/New_York",

  // Where order texts go (digits only, e.g. "17185550123"). Leave "" for copy-to-clipboard only.
  orderSms: "",
  // If you use a real online-ordering page (Square, Toast, ...), put its URL here and every
  // "Order" button will open it instead of the built-in cart.
  externalOrderUrl: "",
  prepMinutes: 10,
  taxRate: 0.08875,
  deliveryFee: 3.0,
  freeDeliveryOver: 30,
  minDelivery: 12,

  social: { instagram: "https://www.instagram.com/maruf.cafe/", tiktok: "https://www.tiktok.com/@marufsi1" },

  // PHOTOS: image URLs or files (e.g. "img/hero.jpg"). Empty = the hand-drawn illustrations are used.
  // Menu items accept `img: "img/latte.jpg"`. The gallery section stays hidden until you add photos.
  // Only use photos you own or are licensed to use.
  heroImage: "",
  gallery: [],

  // Customer reviews. The section stays hidden until you add real ones: { name, stars, text }.
  reviews: [],

  // 0 = Sunday ... 6 = Saturday. [open, close] as 24h "HH:MM", or null when closed.
  hours: {
    0: ["08:00", "17:00"], 1: ["07:00", "19:00"], 2: ["07:00", "19:00"], 3: ["07:00", "19:00"],
    4: ["07:00", "19:00"], 5: ["07:00", "21:00"], 6: ["08:00", "21:00"],
  },

  // Choices shown in the "customize" dialog. type "one" = pick one, "many" = pick any.
  optionGroups: {
    size: { label: "Size", type: "one", choices: [{ name: "Small", price: 0 }, { name: "Medium", price: 0.75 }, { name: "Large", price: 1.5 }] },
    milk: { label: "Milk", type: "one", choices: [{ name: "Whole", price: 0 }, { name: "Skim", price: 0 }, { name: "Oat", price: 0.75 }, { name: "Almond", price: 0.75 }] },
    shots: { label: "Extras", type: "many", choices: [{ name: "Extra shot", price: 1 }, { name: "Vanilla", price: 0.6 }, { name: "Caramel", price: 0.6 }, { name: "Whipped cream", price: 0.5 }] },
    bagel: { label: "Bagel", type: "one", choices: [{ name: "Plain", price: 0 }, { name: "Everything", price: 0 }, { name: "Sesame", price: 0 }] },
    breakfastAdds: { label: "Add-ons", type: "many", choices: [{ name: "Bacon", price: 2.5 }, { name: "Avocado", price: 2 }, { name: "Extra egg", price: 1.5 }] },
  },

  categories: [
    { id: "coffee", name: "Coffee & Espresso" },
    { id: "tea", name: "Tea & Cold Drinks" },
    { id: "breakfast", name: "Breakfast" },
    { id: "lunch", name: "Lunch" },
    { id: "bakery", name: "Bakery & Sweets" },
  ],

  // tags: v vegetarian, vg vegan, gf gluten-free, spicy, pop popular, new
  // kind: which illustration to draw (cup latte iced teapot bagel toast bowl sandwich wrap soup croissant muffin cookie baklava)
  menu: [
    { id: "esp", cat: "coffee", kind: "cup", name: "Espresso", desc: "Double shot, rich and syrupy.", price: 3.25, tags: ["vg", "gf"], groups: ["shots"] },
    { id: "lat", cat: "coffee", kind: "latte", name: "Latte", desc: "Silky steamed milk over espresso. Hot or iced.", price: 4.75, tags: ["v", "gf", "pop"], groups: ["size", "milk", "shots"] },
    { id: "cap", cat: "coffee", kind: "latte", name: "Cappuccino", desc: "Equal parts espresso, milk and foam.", price: 4.5, tags: ["v", "gf"], groups: ["size", "milk", "shots"] },
    { id: "mocha", cat: "coffee", kind: "latte", name: "Mocha", desc: "Espresso, dark chocolate, steamed milk.", price: 5.25, tags: ["v", "gf"], groups: ["size", "milk", "shots"] },
    { id: "cold", cat: "coffee", kind: "iced", tint: "#7a4a2b", name: "Cold Brew", desc: "Steeped 18 hours. Smooth, never bitter.", price: 4.5, tags: ["vg", "gf", "pop"], groups: ["size", "shots"] },
    { id: "karak", cat: "tea", kind: "teapot", name: "Spiced Milk Tea", desc: "Strong black tea simmered with cardamom and ginger.", price: 4.0, tags: ["v", "gf", "new"], groups: ["size", "milk"] },
    { id: "matcha", cat: "tea", kind: "iced", tint: "#8fb86a", name: "Iced Matcha Latte", desc: "Ceremonial-grade matcha over milk and ice.", price: 5.5, tags: ["v", "gf"], groups: ["size", "milk"] },
    { id: "lemon", cat: "tea", kind: "iced", tint: "#f2d04a", name: "Fresh Mint Lemonade", desc: "Squeezed to order with garden mint.", price: 4.25, tags: ["vg", "gf"], groups: ["size"] },
    { id: "bagel", cat: "breakfast", kind: "bagel", name: "Egg & Cheese Bagel", desc: "Toasted bagel, fluffy egg, melted cheddar.", price: 6.5, tags: ["v", "pop"], groups: ["bagel", "breakfastAdds"] },
    { id: "avo", cat: "breakfast", kind: "toast", name: "Avocado Toast", desc: "Sourdough, smashed avocado, chili flakes, lemon.", price: 8.75, tags: ["vg", "spicy"], groups: ["breakfastAdds"] },
    { id: "oat", cat: "breakfast", kind: "bowl", name: "Berry Oatmeal Bowl", desc: "Steel-cut oats, seasonal berries, honey.", price: 7.25, tags: ["v", "gf"], groups: [] },
    { id: "chicken", cat: "lunch", kind: "sandwich", name: "Grilled Chicken Panini", desc: "Pesto, mozzarella, roasted peppers.", price: 11.5, tags: ["pop"], groups: [] },
    { id: "falafel", cat: "lunch", kind: "wrap", name: "Falafel Wrap", desc: "Crispy falafel, tahini, pickles, fresh greens.", price: 10.25, tags: ["vg"], groups: [] },
    { id: "soup", cat: "lunch", kind: "soup", name: "Soup of the Day", desc: "Made fresh each morning. Ask at the counter.", price: 6.5, tags: ["gf"], groups: [] },
    { id: "crois", cat: "bakery", kind: "croissant", name: "Butter Croissant", desc: "Flaky, golden, baked every morning.", price: 3.95, tags: ["v", "pop"], groups: [] },
    { id: "muffin", cat: "bakery", kind: "muffin", name: "Blueberry Muffin", desc: "Big, tender, studded with berries.", price: 3.75, tags: ["v"], groups: [] },
    { id: "cookie", cat: "bakery", kind: "cookie", name: "Chocolate Chunk Cookie", desc: "Crisp edges, gooey middle, sea salt.", price: 3.25, tags: ["v"], groups: [] },
    { id: "baklava", cat: "bakery", kind: "baklava", name: "Pistachio Baklava", desc: "Honey-soaked layers of phyllo and pistachio.", price: 4.5, tags: ["v", "new"], groups: [] },
  ],
};
