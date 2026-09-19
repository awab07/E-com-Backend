import {
    getPOSProducts,
    getPOSProductById,
    getPOSCategories,
    getPOSInventoryLevels,
    fetchPOSInventoryMap,
    streamAllPOSProducts
} from "../services/posService.js";
import { Product } from "../Model/productModel.js";
import { PosSettings } from "../Model/posSettingsModel.js";
import { PosSyncRun } from "../Model/posSyncRunModel.js";
import { applyReservations, getOpenOrderUnits } from "../services/stockReservation.js";

const POS_SITES = ["triplebuzz", "doubleapple"];

const POS_ACCOUNT_ENV = {
    triplebuzz: { domain: "LIGHTSPEED_DOMAIN", token: "LIGHTSPEED_ACCESS_TOKEN" },
    doubleapple: { domain: "LIGHTSPEED_DOMAIN_DOUBLEAPPLE", token: "LIGHTSPEED_ACCESS_TOKEN_DOUBLEAPPLE" }
};

// Every POS endpoint acts on exactly one storefront's Lightspeed account —
// resolved once here so a typo'd/missing site fails loudly instead of
// silently falling through to the wrong store's data.
const resolveSite = (req, res) => {
    const site = req.query.site || "triplebuzz";
    if (!POS_SITES.includes(site)) {
        res.status(400).json({ success: false, message: `site must be one of: ${POS_SITES.join(", ")}` });
        return null;
    }
    return site;
};

const handlePOSError = (res, error) => {
    const status = error.response?.status || 500;
    return res.status(status).json({
        success: false,
        message: error.response?.data?.message || error.message
    });
};

// Defaults to enabled — a site with no settings doc yet has never been
// disabled, so it should behave exactly as it did before this switch existed.
const isSiteEnabled = async (site) => {
    const settings = await PosSettings.findOne({ site }).lean();
    return settings?.enabled !== false;
};

export const fetchPOSProducts = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const { after, before, page_size, sku, name, deleted, include_images } = req.query;

        const { data, nextCursor } = await getPOSProducts(site, {
            page_size: Math.min(parseInt(page_size) || 250, 250),
            after:  after  !== undefined ? Number(after)  : undefined,
            before: before !== undefined ? Number(before) : undefined,
            sku,
            name,
            deleted:        deleted !== undefined ? deleted === "true" : undefined,
            include_images: include_images !== undefined ? include_images === "true" : undefined
        });

        return res.status(200).json({ success: true, data, nextCursor, hasNext: nextCursor !== null });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

export const fetchPOSProductById = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const { id } = req.params;
        const product = await getPOSProductById(site, id);
        return res.status(200).json({ success: true, product });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

export const fetchPOSCategories = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const { after, page_size } = req.query;
        const { data, nextCursor } = await getPOSCategories(site, {
            page_size: Math.min(parseInt(page_size) || 250, 250),
            after
        });
        return res.status(200).json({ success: true, data, nextCursor, hasNext: nextCursor !== null });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

export const fetchPOSInventory = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const { offset, size } = req.query;
        const { data, nextOffset } = await getPOSInventoryLevels(site, {
            offset: parseInt(offset) || 0,
            size: Math.min(parseInt(size) || 250, 250)
        });
        return res.status(200).json({ success: true, data, nextOffset, hasNext: nextOffset !== null });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

// ---- Connection status, kill switch, run history — power the admin portal ----

export const getPOSStatus = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const account = POS_ACCOUNT_ENV[site];
        const domain = process.env[account.domain];
        const connected = Boolean(domain && process.env[account.token]);

        const [enabled, totalProducts, latestSynced, latestRun, settings] = await Promise.all([
            isSiteEnabled(site),
            Product.countDocuments({ site, posId: { $exists: true } }),
            Product.findOne({ site, posId: { $exists: true } }).sort({ posSyncedAt: -1 }).select("posSyncedAt").lean(),
            PosSyncRun.findOne({ site }).sort({ startedAt: -1 }).lean(),
            PosSettings.findOne({ site }).lean()
        ]);

        // The background auto-sync only writes products that actually changed,
        // so Product.posSyncedAt alone would look stale even while it runs —
        // count its last completed cycle as a sync too.
        const lastSyncAt = [latestSynced?.posSyncedAt, settings?.lastAutoSyncAt]
            .filter(Boolean)
            .sort((a, b) => new Date(b) - new Date(a))[0] ?? null;

        return res.status(200).json({
            success: true,
            status: {
                site,
                connected,
                enabled,
                accountName: domain ? `${domain}.retail.lightspeed.app` : "Not configured",
                totalProducts,
                lastSyncAt,
                lastRun: latestRun ?? null,
                autoSync: {
                    lastAt: settings?.lastAutoSyncAt ?? null,
                    lastSummary: settings?.lastAutoSyncSummary ?? null,
                    lastError: settings?.lastAutoSyncError ?? null,
                    lastErrorAt: settings?.lastAutoSyncErrorAt ?? null
                },
                direction: "inbound",
                scopes: ["read:products", "read:product_categories", "read:inventory"]
            }
        });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

export const getPOSSettings = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const settings = await PosSettings.findOne({ site }).lean();
        return res.status(200).json({
            success: true,
            settings: {
                site,
                enabled: settings?.enabled !== false,
                disabledAt: settings?.disabledAt ?? null,
                disabledBy: settings?.disabledBy ?? null
            }
        });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

export const updatePOSSettings = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const { enabled } = req.body;
        if (typeof enabled !== "boolean") {
            return res.status(400).json({ success: false, message: "enabled must be a boolean" });
        }

        const update = {
            enabled,
            disabledAt: enabled ? null : new Date(),
            disabledBy: enabled ? null : (req.user?.name || req.user?.id || "admin")
        };

        const settings = await PosSettings.findOneAndUpdate(
            { site },
            { $set: update },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

        return res.status(200).json({
            success: true,
            message: enabled
                ? `POS sync re-enabled for ${site}.`
                : `POS sync temporarily disabled for ${site} — the next sync call will refuse to run until this is switched back on.`,
            settings
        });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

export const getPOSSyncRuns = async (req, res) => {
    try {
        const site = resolveSite(req, res);
        if (!site) return;

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const runs = await PosSyncRun.find({ site }).sort({ startedAt: -1 }).limit(limit).lean();
        return res.status(200).json({ success: true, runs });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

// Maps a Lightspeed product into this backend's Product shape, tagged for
// whichever storefront's own POS account it was pulled from.
export const mapLightspeedProduct = (posProduct, stockMap, site) => {
    const category = posProduct.product_category?.name?.trim();
    const images = (posProduct.images || [])
        .filter((img) => img?.url)
        .map((img) => ({ url: img.sizes?.original || img.url }));

    return {
        posId: posProduct.id,
        name: (posProduct.name || posProduct.variant_name || "Unnamed product").trim(),
        description: posProduct.description || "",
        price: Number(posProduct.price_excluding_tax) || 0,
        stock: Math.max(0, Math.floor(stockMap.get(posProduct.id) || 0)),
        category: category || "Uncategorized",
        brand: posProduct.brand?.name || undefined,
        image: images,
        site,
        posActive: true,
        posSyncedAt: new Date()
    };
};

// A single sync of ~5,000+ products can't reliably finish inside one
// serverless invocation, so this is self-resuming: it works a time-boxed
// slice of pages, then hands back the cursor it stopped at. Call it again
// with ?site=<site>&after=<resumeAfter> until the response says done:true.
// Upserts are keyed on posId, so calling it repeatedly (including from the
// start) is always safe — it never creates duplicates. Each site's posId
// values come from that site's own Lightspeed account, so a triplebuzz sync
// and a doubleapple sync can never collide with or overwrite each other.
//
// The budget is checked after each product page, so a request can overrun it
// by one slow page (Lightspeed answers in 3-16s). It must stay comfortably
// under the host's request time limit — raise POS_SYNC_TIME_BUDGET_SECONDS
// only if the deployment allows longer requests.
const SYNC_TIME_BUDGET_MS = (Number(process.env.POS_SYNC_TIME_BUDGET_SECONDS) > 0
    ? Number(process.env.POS_SYNC_TIME_BUDGET_SECONDS)
    : 60) * 1000;

export const syncPOSProducts = async (req, res) => {
    const site = resolveSite(req, res);
    if (!site) return;

    const startedAt = new Date();

    // The kill switch: an admin flipped this site off from the portal, so
    // refuse to talk to that Lightspeed account until it's switched back on.
    // Logged as its own run so the portal's history shows *why* nothing
    // happened, instead of the run silently not appearing at all.
    if (!(await isSiteEnabled(site))) {
        await PosSyncRun.create({
            site, startedAt, finishedAt: new Date(), durationMs: 0,
            status: "skipped", done: false,
            message: `Sync skipped — POS sync is temporarily disabled for ${site}.`
        });
        return res.status(423).json({
            success: false,
            message: `POS sync is temporarily disabled for ${site}. Re-enable it from the POS integration settings to sync again.`
        });
    }

    const shouldStop = () => Date.now() - startedAt.getTime() > SYNC_TIME_BUDGET_MS;

    try {
        const inventoryMap = await fetchPOSInventoryMap(site);
        // Site stock is POS stock minus what open web orders already claimed —
        // otherwise this sync would put stock back that a website order took.
        const reservedById = await getOpenOrderUnits();

        let created = 0;
        let updated = 0;
        let processed = 0;
        let skippedInactive = 0;
        const categoriesSeen = new Set();

        const { done, cursor } = await streamAllPOSProducts(site, {
            after: req.query.after !== undefined ? Number(req.query.after) : undefined,
            shouldStop,
            onPage: async (posProducts) => {
                // Deleted-in-POS or turned-off items don't belong on the storefront.
                const sellable = posProducts.filter((p) => p.active && !p.deleted_at);
                skippedInactive += posProducts.length - sellable.length;
                if (sellable.length === 0) return;

                const docs = sellable.map((p) => mapLightspeedProduct(p, inventoryMap, site));
                await applyReservations(docs, reservedById);
                docs.forEach((d) => categoriesSeen.add(d.category));

                const result = await Product.bulkWrite(
                    docs.map((doc) => ({
                        updateOne: {
                            filter: { posId: doc.posId },
                            update: { $set: doc },
                            upsert: true
                        }
                    })),
                    { ordered: false }
                );

                created += result.upsertedCount || 0;
                updated += result.modifiedCount || 0;
                processed += sellable.length;
            }
        });

        const finishedAt = new Date();
        await PosSyncRun.create({
            site, startedAt, finishedAt, durationMs: finishedAt - startedAt,
            status: done ? "success" : "partial",
            done, resumeAfter: done ? null : cursor,
            processed, created, updated, skippedInactive,
            message: done ? null : `Time budget reached — ${cursor} more to resume from.`
        });

        return res.status(200).json({
            success: true,
            site,
            done,
            resumeAfter: done ? null : cursor,
            processed,
            created,
            updated,
            skippedInactive,
            categoriesTouched: [...categoriesSeen],
            message: done
                ? `Sync complete — every active ${site} Lightspeed product has been mirrored.`
                : `Time budget reached. Call POST /POS/sync/products?site=${site}&after=${cursor} to continue.`
        });
    } catch (error) {
        const finishedAt = new Date();
        await PosSyncRun.create({
            site, startedAt, finishedAt, durationMs: finishedAt - startedAt,
            status: "failed", done: false,
            message: error.response?.data?.message || error.message
        }).catch(() => {});
        return handlePOSError(res, error);
    }
};
