import { Order } from "../Model/OrderModel.js";
import { Product } from "../Model/productModel.js";

/**
 * Website orders lower the store's stock the moment they're placed, but the
 * POS never hears about them — its own count only drops once staff ring the
 * sale up. If a sync simply copied the POS number over the store's, every web
 * order would be undone within seconds and the last unit could be sold twice.
 *
 * So stock on the site = POS stock − units in web orders that are still open.
 * "Open" means not yet delivered/cancelled (default: pending, confirmed,
 * shipped), i.e. staff haven't finished fulfilling — and so haven't rung up —
 * the order. Override with POS_RESERVE_STATUSES (comma-separated) if your
 * workflow rings sales up earlier or later than delivery.
 */

export function reserveStatuses() {
    const raw = (process.env.POS_RESERVE_STATUSES || "pending,confirmed,shipped")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return raw.length ? raw : ["pending", "confirmed", "shipped"];
}

const positive = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

// Two limits keep dead orders from holding stock forever:
//  - an online-payment order (PayPal, card…) that never got paid only holds
//    stock for the checkout window (POS_UNPAID_HOLD_MINUTES, default 120) —
//    after that it's an abandoned checkout;
//  - nothing holds stock past POS_RESERVE_MAX_AGE_DAYS (default 30) — an order
//    that old and still "open" is forgotten, not pending.
// Cash-on-delivery orders are never "paid" up front, so they hold stock for
// as long as they're open (within the age limit).

// Map<productObjectId (string), units held by open web orders>.
export async function getOpenOrderUnits() {
    const now = Date.now();
    const maxAge = new Date(now - positive(process.env.POS_RESERVE_MAX_AGE_DAYS, 30) * 86_400_000);
    const unpaidWindow = new Date(now - positive(process.env.POS_UNPAID_HOLD_MINUTES, 120) * 60_000);
    const rows = await Order.aggregate([
        {
            $match: {
                isArchived: { $ne: true },
                // Orders already taken out of the POS by services/posStockPush.js
                // are in its count, so holding them back again would count twice.
                "posStockSync.synced": { $ne: true },
                status: { $in: reserveStatuses() },
                paymentStatus: { $ne: "failed" },
                createdAt: { $gte: maxAge },
                $or: [
                    { paymentMethod: "Cash On Delivery" },
                    { paymentStatus: "paid" },
                    { createdAt: { $gte: unpaidWindow } }
                ]
            }
        },
        { $unwind: "$items" },
        { $group: { _id: "$items.product", units: { $sum: "$items.quantity" } } }
    ]);
    return new Map(rows.map((r) => [String(r._id), r.units]));
}

// What the site should show: POS stock less what open web orders already claim.
export const availableStock = (posStock, reservedUnits = 0) =>
    Math.max(0, Math.floor(posStock || 0) - (reservedUnits || 0));

// For docs about to be written from POS data (each has a posId + POS-derived
// `stock`): subtract open-order units. Looks up the store's own product ids
// for those posIds; brand-new products have no orders, so they're untouched.
export async function applyReservations(docs, reservedById) {
    if (docs.length === 0 || reservedById.size === 0) return docs;
    const rows = await Product.find({ posId: { $in: docs.map((d) => d.posId) } })
        .select("posId")
        .lean();
    const idByPosId = new Map(rows.map((r) => [r.posId, String(r._id)]));
    for (const doc of docs) {
        const id = idByPosId.get(doc.posId);
        if (id) doc.stock = availableStock(doc.stock, reservedById.get(id));
    }
    return docs;
}
