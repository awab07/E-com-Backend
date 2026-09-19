import { getPOSInventoryLevels, streamAllPOSProducts } from "./posService.js";
import { mapLightspeedProduct } from "../Controllers/posController.js";
import { availableStock, getOpenOrderUnits } from "./stockReservation.js";
import { Product } from "../Model/productModel.js";
import { PosSettings } from "../Model/posSettingsModel.js";

/**
 * Background POS -> store sync, so what a visitor sees (price, stock, whether
 * an item exists at all) tracks the POS instead of the last time someone
 * clicked "Run sync now".
 *
 * It's inbound-only, like the manual sync, and built to run back-to-back:
 *   - products: only what changed since the stored version cursor (Lightspeed's
 *     /products is cursor-paged by version, so "nothing changed" is one call);
 *   - stock: Lightspeed has no "what changed" feed for inventory, so every
 *     cycle reads all of it — in parallel pages — and writes only the rows
 *     whose number differs from what we hold. Site stock is the POS number
 *     minus units in still-open web orders (see stockReservation.js), so a
 *     sync never resurrects stock a website order already claimed;
 *   - every few hours a cycle ignores the cursor and re-reads the whole
 *     catalogue, as a safety net: it repairs any change the cursor missed and
 *     hides products that are gone from the POS entirely;
 *   - deactivated/deleted POS items are flagged posActive:false, stock 0, and
 *     drop out of listings (records are kept: past orders reference them).
 *
 * Lightspeed answers in ~3-16s per call, so a cycle can take longer than the
 * 10s minimum gap; the loop starts the next cycle as soon as the gap has
 * passed AND the previous cycle is done — it never overlaps itself.
 *
 * Opt-in: nothing runs unless POS_AUTO_SYNC=on. It never runs on Vercel
 * (serverless can't hold a background loop). Env:
 *   POS_AUTO_SYNC=on
 *   POS_AUTO_SYNC_SITES=triplebuzz[,doubleapple] | all   (default: triplebuzz)
 *   POS_AUTO_SYNC_INTERVAL_SECONDS=10                    (minimum gap)
 *   POS_AUTO_SYNC_FULL_RECHECK_HOURS=6                   (0 = never)
 *   POS_AUTO_SYNC_DRY_RUN=true                           (log only, no writes)
 *   POS_INVENTORY_CONCURRENCY=4
 *   POS_RESERVE_STATUSES=pending,confirmed,shipped
 */

const SITE_ENV = {
    triplebuzz: { domain: "LIGHTSPEED_DOMAIN", token: "LIGHTSPEED_ACCESS_TOKEN" },
    doubleapple: { domain: "LIGHTSPEED_DOMAIN_DOUBLEAPPLE", token: "LIGHTSPEED_ACCESS_TOKEN_DOUBLEAPPLE" }
};

const INVENTORY_PAGE_SIZE = 250;
// The very first cycle and each full re-check walk the whole catalogue (~22
// slow pages), so the lease has to outlast that; other cycles are short.
const LEASE_MS = 10 * 60 * 1000;
const ERROR_BACKOFF_MS = { min: 30_000, max: 120_000 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (site, msg, ...rest) => console.log(`[pos-auto-sync:${site}] ${msg}`, ...rest);

const isTrue = (v) => ["on", "true", "1", "yes"].includes(String(v ?? "").toLowerCase());
const positive = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

function config() {
    const only = (process.env.POS_AUTO_SYNC_SITES || "triplebuzz")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const recheckHours = process.env.POS_AUTO_SYNC_FULL_RECHECK_HOURS;
    return {
        enabled: isTrue(process.env.POS_AUTO_SYNC) && !process.env.VERCEL,
        dryRun: isTrue(process.env.POS_AUTO_SYNC_DRY_RUN),
        minGapMs: Math.max(5, positive(process.env.POS_AUTO_SYNC_INTERVAL_SECONDS, 10)) * 1000,
        concurrency: Math.min(8, Math.max(1, positive(process.env.POS_INVENTORY_CONCURRENCY, 4))),
        // "0" turns the periodic full re-check off; unset defaults to 6h.
        fullRecheckMs: recheckHours === "0" ? 0 : positive(recheckHours, 6) * 60 * 60 * 1000,
        sites: Object.keys(SITE_ENV).filter(
            (site) =>
                (only.includes("all") || only.includes(site)) &&
                process.env[SITE_ENV[site].domain] &&
                process.env[SITE_ENV[site].token]
        )
    };
}

// Lightspeed rate-limits with 429 (+ Retry-After). Retry a few times before
// giving up on the cycle.
async function withRetry(fn) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (err.response?.status !== 429 || attempt >= 3) throw err;
            const retryAfter = Number(err.response.headers?.["retry-after"]);
            await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt * 2) * 1000);
        }
    }
}

// Whole-store stock as Map<posProductId, units>, summed across outlets.
// Pages are offset-based, so they can be fetched in parallel waves. Any failed
// page fails the whole read — a partial map would look like "stock 0" for
// everything on the missing pages.
async function fetchInventoryMap(site, concurrency) {
    const map = new Map();
    for (let wave = 0; ; wave++) {
        const offsets = Array.from({ length: concurrency }, (_, i) => (wave * concurrency + i) * INVENTORY_PAGE_SIZE);
        const pages = await Promise.all(
            offsets.map((offset) => withRetry(() => getPOSInventoryLevels(site, { offset, size: INVENTORY_PAGE_SIZE })))
        );
        let reachedEnd = false;
        for (const { data } of pages) {
            for (const level of data) {
                map.set(level.product_id, (map.get(level.product_id) || 0) + (level.current_inventory_level || 0));
            }
            if (data.length < INVENTORY_PAGE_SIZE) reachedEnd = true;
        }
        if (reachedEnd) return map;
    }
}

async function fetchProductChanges(site, after) {
    const upserts = [];
    const deactivatedPosIds = [];
    const { cursor } = await streamAllPOSProducts(site, {
        after,
        onPage: async (posProducts) => {
            for (const p of posProducts) {
                // Stock is filled in afterwards from the real inventory map.
                if (p.active && !p.deleted_at) upserts.push(mapLightspeedProduct(p, new Map(), site));
                else deactivatedPosIds.push(p.id);
            }
        }
    });
    return { upserts, deactivatedPosIds, cursor: typeof cursor === "number" ? cursor : after };
}

// One pass for one site. Returns a summary; writes nothing when dryRun.
// `forceFull` ignores the stored cursor and re-reads the whole catalogue.
export async function runAutoSyncCycle(site, { dryRun = false, concurrency = 4, fullRecheckMs = 0, forceFull = false } = {}) {
    const startedAt = Date.now();

    const settings = await PosSettings.findOne({ site }).lean();
    if (settings?.enabled === false) return { skipped: "disabled" };

    const lastFullAt = settings?.lastFullSyncAt ? new Date(settings.lastFullSyncAt).getTime() : 0;
    const full =
        forceFull ||
        settings?.productSyncCursor == null ||
        (fullRecheckMs > 0 && startedAt - lastFullAt > fullRecheckMs);
    const after = full ? undefined : settings.productSyncCursor;

    // Stock and product changes are independent reads — do them together.
    const [inventoryMap, changes] = await Promise.all([
        fetchInventoryMap(site, concurrency),
        fetchProductChanges(site, after)
    ]);

    // Guard: a stock read that came back far smaller than the catalogue is a
    // broken read, not "everything sold out" — refuse to write it.
    const known = await Product.countDocuments({ site, posId: { $exists: true }, posActive: { $ne: false } });
    if (known > 50 && inventoryMap.size < known * 0.5) {
        throw new Error(`Stock read looks incomplete (${inventoryMap.size} rows for ${known} products) — not applying it`);
    }

    // What we hold now, then what open web orders have claimed. Read in this
    // order on purpose: if an order lands between the two reads, the row's
    // stock no longer matches what we read, so the guarded write below skips
    // it and the next cycle picks it up — instead of overwriting the order.
    const held = await Product.find({ site, posId: { $exists: true }, posActive: { $ne: false } })
        .select("posId stock")
        .lean();
    const reservedById = await getOpenOrderUnits();
    const reservedFor = new Map(held.map((r) => [r.posId, reservedById.get(String(r._id)) || 0]));

    const now = new Date();
    for (const doc of changes.upserts) {
        doc.stock = availableStock(inventoryMap.get(doc.posId), reservedFor.get(doc.posId));
        doc.posSyncedAt = now;
    }

    // Products we hold that the POS no longer lists as active. On a normal
    // cycle that's exactly what the cursor delta reports. On a full pass we
    // also know the *complete* active set, so anything we hold that isn't in
    // it is gone too — catching a deactivation the cursor never showed us.
    const deactivate = new Set(changes.deactivatedPosIds);
    let orphans = 0;
    let orphansRefused = 0;
    if (full) {
        const activeNow = new Set(changes.upserts.map((d) => d.posId));
        const missing = held.filter((r) => !activeNow.has(r.posId));
        // A truncated read would make "missing" huge — never mass-hide on that.
        // Refuse (and report) rather than fail, or the cycle would re-run the
        // whole slow pass over and over.
        if (changes.upserts.length >= known * 0.5 && missing.length <= known * 0.2) {
            for (const r of missing) if (!deactivate.has(r.posId)) { deactivate.add(r.posId); orphans++; }
        } else {
            orphansRefused = missing.length;
        }
    }

    // Stock drift on products that weren't just rewritten or deactivated.
    const rewritten = new Set([...changes.upserts.map((d) => d.posId), ...deactivate]);
    const stockOps = [];
    for (const row of held) {
        if (rewritten.has(row.posId)) continue;
        const target = availableStock(inventoryMap.get(row.posId), reservedFor.get(row.posId));
        if (target !== row.stock) {
            stockOps.push({
                // Only write if stock is still what we read (see note above).
                updateOne: { filter: { _id: row._id, stock: row.stock }, update: { $set: { stock: target, posSyncedAt: now } } },
                _from: row.stock,
                _to: target,
                _posId: row.posId
            });
        }
    }

    const summary = {
        durationMs: 0,
        full,
        productChanges: changes.upserts.length,
        deactivated: deactivate.size,
        orphansHidden: orphans,
        orphansRefused,
        stockChanges: stockOps.length,
        openOrderUnits: [...reservedById.values()].reduce((n, u) => n + u, 0),
        created: 0,
        updated: 0,
        dryRun
    };

    if (dryRun) {
        summary.sample = stockOps.slice(0, 5).map((o) => ({ posId: o._posId, from: o._from, to: o._to }));
    } else {
        if (changes.upserts.length) {
            const result = await Product.bulkWrite(
                changes.upserts.map((doc) => ({
                    updateOne: { filter: { posId: doc.posId }, update: { $set: doc }, upsert: true }
                })),
                { ordered: false }
            );
            summary.created = result.upsertedCount || 0;
            summary.updated = result.modifiedCount || 0;
        }
        if (deactivate.size) {
            await Product.updateMany(
                { site, posId: { $in: [...deactivate] } },
                { $set: { posActive: false, stock: 0, posSyncedAt: now } }
            );
        }
        if (stockOps.length) {
            await Product.bulkWrite(
                stockOps.map(({ updateOne }) => ({ updateOne })),
                { ordered: false }
            );
        }
        summary.durationMs = Date.now() - startedAt;
        // Only advance the cursor once everything above has been applied.
        await PosSettings.updateOne(
            { site },
            {
                $set: {
                    ...(changes.cursor !== undefined && { productSyncCursor: changes.cursor }),
                    ...(full && { lastFullSyncAt: new Date() }),
                    lastAutoSyncAt: new Date(),
                    lastAutoSyncSummary: summary
                },
                $unset: { lastAutoSyncError: "", lastAutoSyncErrorAt: "" }
            }
        );
    }

    summary.durationMs = Date.now() - startedAt;
    return summary;
}

async function acquireLease(site) {
    await PosSettings.updateOne({ site }, { $setOnInsert: { enabled: true } }, { upsert: true });
    const now = new Date();
    const doc = await PosSettings.findOneAndUpdate(
        { site, $or: [{ autoSyncLockUntil: { $exists: false } }, { autoSyncLockUntil: null }, { autoSyncLockUntil: { $lt: now } }] },
        { $set: { autoSyncLockUntil: new Date(now.getTime() + LEASE_MS) } },
        { returnDocument: "after" }
    );
    return Boolean(doc);
}

const releaseLease = (site) =>
    PosSettings.updateOne({ site }, { $unset: { autoSyncLockUntil: "" } }).catch(() => {});

async function loop(site, cfg) {
    let failures = 0;
    for (;;) {
        const cycleStart = Date.now();
        let waitExtra = 0;
        try {
            if (await acquireLease(site)) {
                try {
                    const s = await runAutoSyncCycle(site, {
                        dryRun: cfg.dryRun,
                        concurrency: cfg.concurrency,
                        fullRecheckMs: cfg.fullRecheckMs
                    });
                    failures = 0;
                    if (s.orphansRefused) {
                        log(site, `WARNING: ${s.orphansRefused} stored products are missing from the POS, which is too many to hide automatically — check the POS catalogue.`);
                    }
                    if (!s.skipped && (s.full || s.productChanges || s.deactivated || s.stockChanges)) {
                        log(site, `${s.full ? "full re-check: " : ""}${s.productChanges} product(s) changed, ${s.deactivated} deactivated${s.orphansHidden ? ` (${s.orphansHidden} missing from POS)` : ""}, ${s.stockChanges} stock update(s) in ${s.durationMs}ms${s.dryRun ? " [dry run]" : ""}`);
                    }
                } finally {
                    await releaseLease(site);
                }
            } else {
                waitExtra = cfg.minGapMs; // another instance holds this site's lease
            }
        } catch (err) {
            failures++;
            const message = err.response?.data?.message || err.message;
            log(site, `cycle failed (${failures}): ${message}`);
            await PosSettings.updateOne(
                { site },
                { $set: { lastAutoSyncError: String(message).slice(0, 300), lastAutoSyncErrorAt: new Date() } }
            ).catch(() => {});
            waitExtra = Math.min(ERROR_BACKOFF_MS.max, ERROR_BACKOFF_MS.min * failures);
        }
        await sleep(Math.max(cfg.minGapMs - (Date.now() - cycleStart), waitExtra, 0));
    }
}

let started = false;

export function startPosAutoSync() {
    if (started) return;
    const cfg = config();
    if (!cfg.enabled) {
        if (isTrue(process.env.POS_AUTO_SYNC) && process.env.VERCEL) {
            console.log("[pos-auto-sync] POS_AUTO_SYNC is on but this is a serverless deploy — not starting.");
        }
        return;
    }
    if (cfg.sites.length === 0) {
        console.log("[pos-auto-sync] enabled, but no selected site has Lightspeed credentials configured.");
        return;
    }
    started = true;
    console.log(
        `[pos-auto-sync] starting for ${cfg.sites.join(", ")} — cycle every ${cfg.minGapMs / 1000}s or as fast as Lightspeed answers, full re-check ${cfg.fullRecheckMs ? `every ${cfg.fullRecheckMs / 3_600_000}h` : "off"}${cfg.dryRun ? " [DRY RUN: no writes]" : ""}`
    );
    // Each site is its own Lightspeed account, so they run independently.
    for (const site of cfg.sites) void loop(site, cfg);
}
