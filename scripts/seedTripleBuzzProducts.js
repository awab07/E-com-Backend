// One-off local utility: creates real Product records for Triple Buzz's
// catalogue (site: "triplebuzz") in the shared backend database, uploading
// each product's actual photo. Run this yourself from your own terminal —
// it prompts for YOUR admin email/password interactively (they are sent
// straight to the login endpoint and never written anywhere) so an admin
// session token never has to be typed in by anyone else.
//
// Usage:
//   cd E:\E-com-Backend\Backend
//   node scripts/seedTripleBuzzProducts.js
//
// Safe to re-run: products already created (matched by name+category, same
// rule the backend itself uses to reject duplicates) are looked up and
// skipped rather than duplicated, so the output mapping stays complete.
//
// Output: scripts/tripleBuzzProductIds.json — a { slug: mongoId } map.
// Hand that file back so Triple Buzz's frontend can be wired to the real
// product ids for cart/wishlist/reviews/checkout.

import { createInterface } from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_BASE = 'https://triple-buzz-store-backend-one.vercel.app'

// This machine's local checkout of the Triple Buzz frontend repo — adjust if
// yours lives somewhere else.
const IMAGES_DIR = 'E:/Triplebuzz-main/src/assets/images'
const PRODUCTS_DIR = `${IMAGES_DIR}/products`
const TORCH_IMAGE = `${IMAGES_DIR}/hero-slide-4.png`

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function describe(name, brand, meta, category) {
  const bits = []
  if (brand) bits.push(brand)
  if (meta) bits.push(meta)
  bits.push(`Part of Triple Buzz's ${category} lineup.`)
  return bits.join(' — ')
}

const CATALOG = [
  { name: 'Coco Nara Natural Coconut Charcoal', brand: 'COCO NARA', meta: 'Coconut Charcoal', price: 14.99, category: 'Shisha Hookah', image: `${PRODUCTS_DIR}/coco-nara-charcoal.jpg` },
  { name: 'Three Kings Charcoal Briquettes', brand: 'THREE KINGS', meta: 'Large Size', price: 8.99, category: 'Shisha Hookah', image: `${PRODUCTS_DIR}/three-kings-charcoal.jpg` },
  { name: 'Al Fakher Lemon with Mint Shisha', brand: 'AL FAKHER', meta: '50g', price: 6.99, category: 'Shisha Hookah', image: `${PRODUCTS_DIR}/al-fakher-lemon-mint.jpg` },
  { name: 'Al Fakher Orange with Mint Shisha', brand: 'AL FAKHER', meta: '250g', price: 21.99, category: 'Shisha Hookah', image: `${PRODUCTS_DIR}/al-fakher-orange-mint.jpg` },
  { name: 'Al Fakher Gum with Mint Shisha', brand: 'AL FAKHER', meta: '50g', price: 6.99, category: 'Shisha Hookah', image: `${PRODUCTS_DIR}/al-fakher-gum-mint.jpg`, stock: 0 },
  { name: 'Al Fakher Melon Shisha', brand: 'AL FAKHER', meta: 'Authentic Hookah Tobacco', price: 21.99, category: 'Shisha Hookah', image: `${PRODUCTS_DIR}/al-fakher-melon.jpg` },

  { name: 'Destroyer THC-A Live Rosin Badder Panama Red Sativa', brand: 'DESTROYER', price: 439.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/geek-next-x50000.jpg` },
  { name: 'Destroyer THC-A Diamond Blue Dream Hybrid', brand: 'DESTROYER', price: 439.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/disposable-vape-60k.png` },
  { name: 'Geek Next X50000 Disposable Vape - Miami Mint', brand: 'GEEK NEXT', meta: '50000 Puffs', price: 34.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/geek-next-x50000.jpg` },
  { name: 'Puffco Proxy Vaporizer', brand: 'PUFFCO', price: 299.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/fvkd-ice-cream-cake.jpg` },
  { name: '60K Puffs Disposable Vape', brand: null, meta: '60000 Puffs', price: 29.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/disposable-vape-60k.png` },
  { name: 'Dr. Dabber Switch Vaporizer', brand: 'DR. DABBER', price: 349.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/smok-m-coil.png` },
  { name: 'FVKD Premium Disposable - Ice Cream Cake', brand: 'FVKD', meta: '3.5g THCA Badder', price: 44.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/fvkd-ice-cream-cake.jpg`, stock: 0 },
  { name: 'Smok M-Coil Replacement Coils (5-Pack)', brand: 'SMOK', meta: '0.6Ω', price: 12.99, category: 'THC Vapes', image: `${PRODUCTS_DIR}/smok-m-coil.png` },

  { name: 'Bic Classic Lighter', brand: 'BIC', price: 2.99, category: 'Torches & Lighters', image: TORCH_IMAGE },
  { name: 'Blazer Big Buddy Torch', brand: 'BLAZER', price: 54.99, category: 'Torches & Lighters', image: TORCH_IMAGE },
  { name: 'Whip-It Vector Torch', brand: 'WHIP-IT!', price: 39.99, category: 'Torches & Lighters', image: TORCH_IMAGE },
  { name: 'Zico Butane Torch Lighter', brand: 'ZICO', price: 24.99, category: 'Torches & Lighters', image: TORCH_IMAGE },

  { name: 'Wood Rolling Tray - Large', brand: null, price: 16.99, category: 'Ashtrays & Trays', image: `${PRODUCTS_DIR}/casino-glass-ashtrays.png` },
  { name: 'Ceramic Ashtray - Round', brand: null, price: 9.99, category: 'Ashtrays & Trays', image: `${PRODUCTS_DIR}/casino-glass-ashtrays.png` },
  { name: 'Casino Royal Glass Ashtray', brand: null, meta: 'Assorted Designs', price: 14.99, category: 'Ashtrays & Trays', image: `${PRODUCTS_DIR}/casino-glass-ashtrays.png` },
  { name: 'Metal Skull Ashtray', brand: null, price: 14.99, category: 'Ashtrays & Trays', image: `${PRODUCTS_DIR}/casino-glass-ashtrays.png` },

  { name: 'Wyld Huckleberry Gummies', brand: 'WYLD', meta: '10ct, 10mg THC each', price: 18.99, category: 'THC Gummies', image: `${PRODUCTS_DIR}/wyld-huckleberry-gummies.png` },

  { name: 'Torch THC Seltzer - Pineapple Twist', brand: 'TORCH', meta: '60mg THC, 12 FL OZ', price: 9.99, category: 'THC Drinks', image: `${PRODUCTS_DIR}/torch-seltzer-pineapple-twist.jpg` },

  { name: 'Herbal Clean Q Carbo 16 Detox - Tropical', brand: 'HERBAL CLEAN', meta: 'Same-Day Detox, 16oz', price: 34.99, category: 'Detox', image: `${PRODUCTS_DIR}/qcarbo-detox-tropical.jpg` },

  { name: 'Musky Zeina Concentrated Perfume Oil', brand: 'MUSKY', meta: '6ml', price: 12.99, category: 'Perfumes', image: `${PRODUCTS_DIR}/musky-zeina-perfume.png` },

  { name: 'aLeaf 2-Piece Herb Grinder', brand: 'ALEAF', meta: '2-Piece', price: 16.99, category: 'Smoking Accessories', image: `${PRODUCTS_DIR}/aleaf-grinder.jpg` },
  { name: 'Quartz Banger Nail', brand: null, price: 19.99, category: 'Smoking Accessories', image: `${PRODUCTS_DIR}/quartz-banger.jpg` },
]

async function login(email, password) {
  const res = await fetch(`${API_BASE}/Api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok || !data.accessToken) {
    throw new Error(data?.message ?? `Login failed (${res.status})`)
  }
  if (data.user?.role !== 'admin') {
    throw new Error(`That account's role is "${data.user?.role}", not "admin" — product creation needs an admin account.`)
  }
  return data.accessToken
}

async function findExisting(token, name) {
  const res = await fetch(`${API_BASE}/Product/allproducts?limit=5&search=${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.products?.find((p) => p.name === name) ?? null
}

async function createProduct(token, item) {
  const fd = new FormData()
  fd.append('name', item.name)
  fd.append('description', describe(item.name, item.brand, item.meta, item.category))
  fd.append('price', String(item.price))
  fd.append('stock', String(item.stock ?? 25))
  fd.append('category', item.category)
  fd.append('site', 'triplebuzz')

  const bytes = readFileSync(item.image)
  const filename = path.basename(item.image)
  const ext = path.extname(filename).slice(1)
  fd.append('images', new Blob([bytes], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }), filename)

  const res = await fetch(`${API_BASE}/Product/createProduct`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  const data = await res.json()

  if (res.status === 409) {
    // Already exists (name+category clash) — look it up instead of failing.
    const existing = await findExisting(token, item.name)
    if (existing) return { _id: existing._id, reused: true }
    throw new Error(data?.message ?? 'Conflict, and could not find the existing product')
  }
  if (!res.ok || !data.success) {
    throw new Error(data?.message ?? `Create failed (${res.status})`)
  }
  return { _id: data.newProduct._id, reused: false }
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  console.log('Triple Buzz product seeding — creates', CATALOG.length, 'real products (site: triplebuzz).')
  console.log('Enter your own admin credentials below (sent directly to the login endpoint, not stored).\n')
  const email = await rl.question('Admin email: ')
  const password = await rl.question('Admin password: ')
  rl.close()

  console.log('\nLogging in…')
  const token = await login(email.trim(), password)
  console.log('Logged in as admin. Creating products…\n')

  const mapping = {}
  let created = 0
  let reused = 0
  let failed = 0

  for (const item of CATALOG) {
    const slug = slugify(item.name)
    try {
      const result = await createProduct(token, item)
      mapping[slug] = result._id
      if (result.reused) {
        reused++
        console.log(`  = ${item.name} (already existed, reusing id)`)
      } else {
        created++
        console.log(`  + ${item.name}`)
      }
    } catch (err) {
      failed++
      console.error(`  ! ${item.name} — ${err.message}`)
    }
  }

  const outPath = path.join(__dirname, 'tripleBuzzProductIds.json')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(outPath, JSON.stringify(mapping, null, 2))

  console.log(`\nDone. Created ${created}, reused ${reused}, failed ${failed}.`)
  console.log(`Mapping written to ${outPath}`)
}

main().catch((err) => {
  console.error('\nSeeding failed:', err.message)
  process.exit(1)
})
