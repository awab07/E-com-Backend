import {
    getPOSProducts,
    getPOSProductById,
    getPOSCategories,
    getPOSInventoryLevels,
    fetchPOSInventoryMap,
    streamAllPOSProducts
} from "../services/posService.js";
import { Product } from "../Model/productModel.js";

const handlePOSError = (res, error) => {
    const status = error.response?.status || 500;
    return res.status(status).json({
        success: false,
        message: error.response?.data?.message || error.message
    });
};

export const fetchPOSProducts = async (req, res) => {
    try {
        const { after, before, page_size, sku, name, deleted, include_images } = req.query;

        const { data, nextCursor } = await getPOSProducts({
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
        const { id } = req.params;
        const product = await getPOSProductById(id);
        return res.status(200).json({ success: true, product });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

export const fetchPOSCategories = async (req, res) => {
    try {
        const { after, page_size } = req.query;
        const { data, nextCursor } = await getPOSCategories({
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
        const { offset, size } = req.query;
        const { data, nextOffset } = await getPOSInventoryLevels({
            offset: parseInt(offset) || 0,
            size: Math.min(parseInt(size) || 250, 250)
        });
        return res.status(200).json({ success: true, data, nextOffset, hasNext: nextOffset !== null });
    } catch (error) {
        return handlePOSError(res, error);
    }
};

// Maps a Lightspeed product into this backend's Product shape. Always tagged
// site: "triplebuzz" since that's the only storefront this POS feeds.
const mapLightspeedProduct = (posProduct, stockMap) => {
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
        site: "triplebuzz",
        posSyncedAt: new Date()
    };
};

// A single sync of ~5,000+ products can't reliably finish inside one
// serverless invocation, so this is self-resuming: it works a time-boxed
// slice of pages, then hands back the cursor it stopped at. Call it again
// with ?after=<resumeAfter> until the response says done:true. Upserts are
// keyed on posId, so calling it repeatedly (including from the start) is
// always safe — it never creates duplicates.
const SYNC_TIME_BUDGET_MS = 45000;

export const syncPOSProducts = async (req, res) => {
    const startedAt = Date.now();
    const shouldStop = () => Date.now() - startedAt > SYNC_TIME_BUDGET_MS;

    try {
        const inventoryMap = await fetchPOSInventoryMap();

        let created = 0;
        let updated = 0;
        let processed = 0;
        let skippedInactive = 0;
        const categoriesSeen = new Set();

        const { done, cursor } = await streamAllPOSProducts({
            after: req.query.after !== undefined ? Number(req.query.after) : undefined,
            shouldStop,
            onPage: async (posProducts) => {
                // Deleted-in-POS or turned-off items don't belong on the storefront.
                const sellable = posProducts.filter((p) => p.active && !p.deleted_at);
                skippedInactive += posProducts.length - sellable.length;
                if (sellable.length === 0) return;

                const docs = sellable.map((p) => mapLightspeedProduct(p, inventoryMap));
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

        return res.status(200).json({
            success: true,
            done,
            resumeAfter: done ? null : cursor,
            processed,
            created,
            updated,
            skippedInactive,
            categoriesTouched: [...categoriesSeen],
            message: done
                ? "Sync complete — every active Lightspeed product has been mirrored."
                : `Time budget reached. Call POST /POS/sync/products?after=${cursor} to continue.`
        });
    } catch (error) {
        return handlePOSError(res, error);
    }
};
