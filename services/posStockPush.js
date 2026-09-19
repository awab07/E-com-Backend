import { Order } from "../Model/OrderModel.js";
import { Product } from "../Model/productModel.js";
import { PosSettings } from "../Model/posSettingsModel.js";
import { createPOSStockAdjustments, getPOSOutletIdForProduct } from "./posService.js";

/**
 * Pushes a web order's stock movement into Lightspeed (POST /stock_adjustments)
 * so the POS count drops when an order is placed/paid, and comes back if the
 * order is cancelled.
 *
 * Lightspeed's adjustment API has no "sale" reason, so a web order is written
 * as INTERNAL_USE (out) / STOCK_FOUND (back in). To use your own reason
 * instead, create a custom adjustment reason in Lightspeed and set
 * LIGHTSPEED_STOCK_REASON_ID (Triple Buzz) / LIGHTSPEED_STOCK_REASON_ID_DOUBLEAPPLE
 * - it is then sent as reason CUSTOM for both directions. Override the built-in
 * reasons with POS_STOCK_REASON_OUT / POS_STOCK_REASON_IN.
 *
 * Never throws: a POS outage or a token without the inventory:write scope must
 * not fail a customer's order. Failures are recorded on the order
 * (posStockSync.error) and the order simply stays reserved by
 * services/stockReservation.js until a later attempt succeeds - the push is
 * idempotent per order line, so retrying never double-counts.
 *
 * Turn the whole thing off with POS_STOCK_PUSH=off.
 */

const SITES = ["triplebuzz", "doubleapple"];

const pushEnabled = () => String(process.env.POS_STOCK_PUSH ?? "on").toLowerCase() !== "off";

function reasonFields(site, quantity) {
    const customId = site === "doubleapple"
        ? process.env.LIGHTSPEED_STOCK_REASON_ID_DOUBLEAPPLE
        : process.env.LIGHTSPEED_STOCK_REASON_ID;
    if (customId) {
        return { reason: "CUSTOM", custom_inventory_adjustment_reason_id: customId };
    }
    return {
        reason: quantity < 0
            ? (process.env.POS_STOCK_REASON_OUT || "INTERNAL_USE")
            : (process.env.POS_STOCK_REASON_IN || "STOCK_FOUND")
    };
}

const describe = (err) =>
    err.response
        ? `Lightspeed ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 300)}`
        : err.message;

async function siteEnabled(site) {
    const settings = await PosSettings.findOne({ site }).lean();
    return settings?.enabled !== false;
}

async function recordResult(orderId, { lines, error, synced, reversedAt }) {
    const set = { "posStockSync.lines": lines };
    if (synced !== undefined) set["posStockSync.synced"] = synced;
    if (synced) set["posStockSync.syncedAt"] = new Date();
    if (reversedAt) set["posStockSync.reversedAt"] = reversedAt;
    if (error) {
        set["posStockSync.error"] = error;
        set["posStockSync.errorAt"] = new Date();
    } else {
        set["posStockSync.error"] = null;
    }
    await Order.updateOne({ _id: orderId }, { $set: set });
}

/** Take an order's units out of the POS. Safe to call more than once. */
export async function pushOrderStockToPOS(order) {
    if (!pushEnabled()) return { skipped: "disabled" };
    try {
        const current = await Order.findById(order._id).select("items posStockSync status").lean();
        if (!current) return { skipped: "not-found" };
        if (current.posStockSync?.synced || current.posStockSync?.reversedAt) return { skipped: "already-handled" };
        if (current.status === "cancelled") return { skipped: "cancelled" };

        const done = new Map((current.posStockSync?.lines || []).map((l) => [String(l.product), l]));
        const products = await Product.find({ _id: { $in: current.items.map((i) => i.product) } })
            .select("posId site")
            .lean();
        const byId = new Map(products.map((p) => [String(p._id), p]));

        // Only POS-synced products that belong to one specific storefront's
        // Lightspeed account, and that we haven't already pushed.
        const pending = current.items
            .map((item) => ({ item, product: byId.get(String(item.product)) }))
            .filter(({ item, product }) =>
                product?.posId && SITES.includes(product.site) && !done.has(String(item.product))
            );
        if (pending.length === 0) return { skipped: "nothing-to-push" };

        const lines = [...done.values()];
        const errors = [];

        for (const site of SITES) {
            const group = pending.filter(({ product }) => product.site === site);
            if (group.length === 0) continue;
            try {
                if (!(await siteEnabled(site))) throw new Error(`POS integration is switched off for ${site}`);
                const entries = [];
                for (const { item, product } of group) {
                    const outletId = await getPOSOutletIdForProduct(site, product.posId);
                    const quantity = -Math.abs(item.quantity);
                    entries.push({
                        product_id: product.posId,
                        outlet_id: outletId,
                        quantity: String(quantity),
                        ...reasonFields(site, quantity)
                    });
                }
                const created = await createPOSStockAdjustments(site, entries);
                group.forEach(({ item, product }, i) => {
                    lines.push({
                        site,
                        product: item.product,
                        posProductId: product.posId,
                        outletId: entries[i].outlet_id,
                        quantity: item.quantity,
                        adjustmentId: created[i]?.id
                    });
                });
            } catch (err) {
                errors.push(`${site}: ${describe(err)}`);
            }
        }

        const allDone = errors.length === 0;
        await recordResult(order._id, { lines, synced: allDone, error: errors.join(" | ") || null });
        if (!allDone) console.error(`[POS stock] order ${order._id} not fully pushed:`, errors.join(" | "));
        return { synced: allDone, lines: lines.length, error: errors.join(" | ") || null };
    } catch (err) {
        console.error(`[POS stock] order ${order?._id} push failed:`, describe(err));
        return { error: describe(err) };
    }
}

/** Put a cancelled order's units back into the POS. Safe to call more than once. */
export async function reverseOrderStockInPOS(order) {
    if (!pushEnabled()) return { skipped: "disabled" };
    try {
        const current = await Order.findById(order._id).select("posStockSync").lean();
        const sync = current?.posStockSync;
        if (!sync?.lines?.length || sync.reversedAt) return { skipped: "nothing-to-reverse" };

        const errors = [];
        for (const site of SITES) {
            const group = sync.lines.filter((l) => l.site === site);
            if (group.length === 0) continue;
            try {
                await createPOSStockAdjustments(site, group.map((l) => ({
                    product_id: l.posProductId,
                    outlet_id: l.outletId,
                    quantity: String(Math.abs(l.quantity)),
                    ...reasonFields(site, 1)
                })));
            } catch (err) {
                errors.push(`${site}: ${describe(err)}`);
            }
        }

        if (errors.length === 0) {
            await recordResult(order._id, { lines: sync.lines, synced: false, reversedAt: new Date() });
        } else {
            // A retry would re-add units for a site that already succeeded, so a
            // partial reversal is left flagged for a person rather than guessed at.
            await recordResult(order._id, { lines: sync.lines, error: `reversal incomplete - ${errors.join(" | ")}` });
            console.error(`[POS stock] order ${order._id} reversal incomplete:`, errors.join(" | "));
        }
        return { reversed: errors.length === 0, error: errors.join(" | ") || null };
    } catch (err) {
        console.error(`[POS stock] order ${order?._id} reversal failed:`, describe(err));
        return { error: describe(err) };
    }
}
