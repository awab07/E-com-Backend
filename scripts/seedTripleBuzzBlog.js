// One-off local utility: creates real Blog posts (site: "triplebuzz") in the
// shared backend, uploading each post's cover photo. Mirrors
// seedTripleBuzzProducts.js — run it yourself from your own terminal, it
// prompts for YOUR admin email/password interactively (sent straight to the
// login endpoint, never written anywhere).
//
// Usage:
//   cd E:\E-com-Backend\Backend
//   node scripts/seedTripleBuzzBlog.js
//
// Safe to re-run: posts already created (matched by exact title) are looked
// up and skipped rather than duplicated.

import { createInterface } from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const API_BASE = 'https://triple-buzz-store-backend-one.vercel.app'

// This machine's local checkout of the Triple Buzz frontend repo — adjust if
// yours lives somewhere else.
const IMAGES_DIR = 'E:/Triplebuzz-main/src/assets/images'

const POSTS = [
  {
    title: 'Kick Back with the Best Shisha in Pflugerville at Triple Buzz Smoke Shop',
    category: 'Shisha Hookah',
    image: `${IMAGES_DIR}/lifestyle-friends-hookah.png`,
    content: `There's nothing quite like unwinding with a good hookah session among friends, and Pflugerville locals have made Triple Buzz Smoke Shop their go-to spot for exactly that. Whether you're a seasoned shisha enthusiast or trying your first bowl, our shelves are stocked with the flavors and gear that make a session worth remembering.

We carry the brands people actually ask for by name — Al Fakher's lineup of authentic hookah tobacco in lemon-mint, orange-mint, and melon, plus the coconut and briquette charcoal you need to keep a bowl burning clean and long. Coco Nara's natural coconut charcoal in particular has become a staff favorite for its steady heat and near-absence of ash taste, and Three Kings briquettes are always in stock for anyone who prefers a faster-lighting option.

Beyond the tobacco itself, our team can walk you through packing technique, heat management, and which flavor pairings tend to work best together — the kind of guidance you don't get ordering online. Stop by our Pflugerville location any day of the week and let us help you put together your next session.`,
  },
  {
    title: 'THC Vape Buying Guide: Pods, Disposables & Batteries Explained',
    category: 'THC Vapes',
    image: `${IMAGES_DIR}/hero-slide-2.png`,
    content: `Walking into a smoke shop's vape section for the first time can feel overwhelming — disposables, refillable pods, 510-thread batteries, wattage settings, puff counts. Here's the short version of what actually matters when you're choosing between them.

Disposables (like the Geek Next X50000 or our 60K Puffs option) are the simplest path: no charging, no refilling, no settings to figure out. You use it until it's empty, then you're done. They're the right call if you want zero maintenance and don't mind replacing the whole device.

THC-A vape cartridges paired with a 510-thread battery, on the other hand, let you swap between different strains and extracts without buying a new device every time — better value if you go through vapes regularly, and a lot of our regulars prefer the control over airflow and voltage that a dedicated battery gives you.

Whichever direction you lean, stock and freshness matter more than the marketing on the box. We rotate our vape inventory regularly and our staff can tell you what's actually moving well versus what's been sitting — ask before you buy, not after.`,
  },
  {
    title: '5 Torch Lighter Safety Tips Every Dab Rig Owner Should Know',
    category: 'Torches & Lighters',
    image: `${IMAGES_DIR}/hero-slide-4.png`,
    content: `A butane torch is a simple tool, but it's still an open flame running at temperatures well above a household lighter — worth treating with a bit more respect. A few habits that go a long way:

1. Always fill outdoors or in a well-ventilated room, and let a freshly filled torch sit a few minutes before lighting — butane needs time to settle and warm to room temperature.
2. Keep the flame pointed away from your body and any loose fabric while lighting, especially with larger torches like the Blazer Big Buddy that put out a wider flame.
3. Never leave a lit torch unattended, even for a few seconds — a knocked-over torch on a table is a fast way to start a fire.
4. Store torches away from direct sunlight and heat sources; a hot car dashboard in summer is one of the most common causes of butane canister failure.
5. Replace a torch that's sparking irregularly or won't hold a steady flame — it's cheaper to swap it out than to keep coaxing a failing unit.

We carry torches across a range of price points, from the pocket-friendly Zico to the heavy-duty Whip-It Vector, and our team is always happy to talk through which one fits how you actually use it.`,
  },
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
    throw new Error(`That account's role is "${data.user?.role}", not "admin" — blog creation needs an admin account.`)
  }
  return data.accessToken
}

async function findExisting(token, title) {
  const res = await fetch(`${API_BASE}/Blog?limit=50&site=triplebuzz`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.blogs?.find((b) => b.title === title) ?? null
}

async function createPost(token, post) {
  // The Blog model has no uniqueness constraint on title (unlike Product,
  // which rejects a name+category clash), so re-running this script would
  // create duplicate posts unless we check first.
  const existing = await findExisting(token, post.title)
  if (existing) return { _id: existing._id, reused: true }

  const fd = new FormData()
  fd.append('title', post.title)
  fd.append('content', post.content)
  fd.append('category', post.category)
  fd.append('site', 'triplebuzz')

  const bytes = readFileSync(post.image)
  const filename = path.basename(post.image)
  const ext = path.extname(filename).slice(1)
  fd.append('image', new Blob([bytes], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }), filename)

  const res = await fetch(`${API_BASE}/Blog`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new Error(data?.message ?? `Create failed (${res.status})`)
  }
  return { _id: data.blog._id, reused: false }
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  console.log('Triple Buzz blog seeding — creates', POSTS.length, 'real posts (site: triplebuzz).')
  console.log('Enter your own admin credentials below (sent directly to the login endpoint, not stored).\n')
  const email = await rl.question('Admin email: ')
  const password = await rl.question('Admin password: ')
  rl.close()

  console.log('\nLogging in…')
  const token = await login(email.trim(), password)
  console.log('Logged in as admin. Creating posts…\n')

  let created = 0
  let reused = 0
  let failed = 0

  for (const post of POSTS) {
    try {
      const result = await createPost(token, post)
      if (result.reused) {
        reused++
        console.log(`  = ${post.title} (already existed, reusing id)`)
      } else {
        created++
        console.log(`  + ${post.title}`)
      }
    } catch (err) {
      failed++
      console.error(`  ! ${post.title} — ${err.message}`)
    }
  }

  console.log(`\nDone. Created ${created}, reused ${reused}, failed ${failed}.`)
}

main().catch((err) => {
  console.error('\nSeeding failed:', err.message)
  process.exit(1)
})
