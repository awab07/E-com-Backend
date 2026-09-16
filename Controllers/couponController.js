import { Coupon } from "../Model/CouponModel.js";

const SITES = ["doubleapple", "triplebuzz", "both"];
const DISCOUNT_TYPES = ["percentage", "fixed"];

// A coupon's stored `isActive` is just the admin's manual on/off switch — it
// says nothing about whether today actually falls inside startDate/endDate.
// This mirrors withEffectiveDiscount in productController.js: computes
// whether the coupon is *live right now*, so the end date "automatically
// deactivates" it the moment it passes, without a cron job ever having to
// flip a stored flag.
export function withComputedStatus(coupon) {
    const now = new Date();
    const start = new Date(coupon.startDate);
    const end = new Date(coupon.endDate);
    const withinWindow = now >= start && now <= end;
    const isLive = !!(coupon.isActive && withinWindow);

    let status = "disabled";
    if (coupon.isActive) {
        if (now < start) status = "scheduled";
        else if (now > end) status = "expired";
        else status = "active";
    }

    return { ...coupon, isLive, status };
}

function buildRibbonText(coupon) {
    if (coupon.ribbonText?.trim()) return coupon.ribbonText.trim();
    const amount = coupon.discountType === "percentage" ? `${coupon.value}%` : `$${coupon.value}`;
    return `USE CODE ${coupon.code} FOR ${amount} OFF YOUR ORDER!`;
}

// Shared by validateCoupon (the storefront cart's "Apply" button) and
// OrderController's prepareOrder (actually pricing a checkout). Returns the
// resolved code + discount amount against a given pre-discount total, or
// throws an Error with a `.status` for the caller to surface — the same
// shape prepareOrder's own OrderValidationError uses for a bad address etc.
export async function resolveCouponDiscount(code, preDiscountTotal, site) {
    const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase() }).lean();
    if (!coupon) {
        const err = new Error("That coupon code isn't valid.");
        err.status = 404;
        throw err;
    }

    const { isLive } = withComputedStatus(coupon);
    if (!isLive) {
        const err = new Error("That coupon has expired or is not active.");
        err.status = 400;
        throw err;
    }

    if (SITES.includes(site) && coupon.site !== "both" && coupon.site !== site) {
        const err = new Error("That coupon isn't valid for this store.");
        err.status = 400;
        throw err;
    }

    const amount = Number(preDiscountTotal) || 0;
    if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
        const err = new Error(`This coupon needs a minimum order of $${coupon.minOrderAmount.toFixed(2)}.`);
        err.status = 400;
        throw err;
    }

    let discount = coupon.discountType === "percentage" ? (amount * coupon.value) / 100 : coupon.value;
    discount = Math.max(0, Math.min(discount, amount));
    discount = Math.round(discount * 100) / 100;

    return { code: coupon.code, discountType: coupon.discountType, value: coupon.value, discount };
}

export const createCoupon = async (req, res) => {
    try {
        const { code, discountType, value, startDate, endDate, minOrderAmount, site, showOnRibbon, ribbonText, isActive } = req.body;

        if (!code || value === undefined || value === null || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: "Please fill all required fields!" });
        }
        if (discountType && !DISCOUNT_TYPES.includes(discountType)) {
            return res.status(400).json({ success: false, message: "Invalid discount type!" });
        }
        const resolvedType = discountType || "percentage";
        if (Number(value) <= 0) {
            return res.status(400).json({ success: false, message: "Value must be greater than 0!" });
        }
        if (resolvedType === "percentage" && (Number(value) < 1 || Number(value) > 100)) {
            return res.status(400).json({ success: false, message: "Percentage must be between 1 and 100!" });
        }
        if (new Date(startDate) >= new Date(endDate)) {
            return res.status(400).json({ success: false, message: "End date must be after start date." });
        }

        const existing = await Coupon.findOne({ code: code.trim().toUpperCase() }).lean();
        if (existing) {
            return res.status(409).json({ success: false, message: "A coupon with that code already exists!" });
        }

        const coupon = await Coupon.create({
            code: code.trim().toUpperCase(),
            discountType: resolvedType,
            value,
            startDate,
            endDate,
            minOrderAmount: minOrderAmount || 0,
            site: SITES.includes(site) ? site : "both",
            showOnRibbon: !!showOnRibbon,
            ribbonText: ribbonText?.trim() || "",
            isActive: isActive === undefined ? true : !!isActive
        });

        return res.status(201).json({
            success: true,
            message: "Coupon Created Successfully!",
            coupon: withComputedStatus(coupon.toObject())
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, coupons: coupons.map(withComputedStatus) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, discountType, value, startDate, endDate, minOrderAmount, site, showOnRibbon, ribbonText, isActive } = req.body;

        const coupon = await Coupon.findById(id);
        if (!coupon) return res.status(404).json({ success: false, message: "Coupon Not Found!" });

        if (code?.trim()) {
            const newCode = code.trim().toUpperCase();
            if (newCode !== coupon.code) {
                const clash = await Coupon.findOne({ code: newCode, _id: { $ne: id } }).lean();
                if (clash) return res.status(409).json({ success: false, message: "A coupon with that code already exists!" });
                coupon.code = newCode;
            }
        }
        if (discountType) {
            if (!DISCOUNT_TYPES.includes(discountType)) {
                return res.status(400).json({ success: false, message: "Invalid discount type!" });
            }
            coupon.discountType = discountType;
        }
        if (value !== undefined && value !== null && value !== "") {
            if (Number(value) <= 0) return res.status(400).json({ success: false, message: "Value must be greater than 0!" });
            coupon.value = value;
        }
        if (coupon.discountType === "percentage" && (Number(coupon.value) < 1 || Number(coupon.value) > 100)) {
            return res.status(400).json({ success: false, message: "Percentage must be between 1 and 100!" });
        }
        if (startDate) coupon.startDate = startDate;
        if (endDate) coupon.endDate = endDate;
        if (new Date(coupon.startDate) >= new Date(coupon.endDate)) {
            return res.status(400).json({ success: false, message: "End date must be after start date." });
        }
        if (minOrderAmount !== undefined) coupon.minOrderAmount = minOrderAmount;
        if (SITES.includes(site)) coupon.site = site;
        if (showOnRibbon !== undefined) coupon.showOnRibbon = !!showOnRibbon;
        if (ribbonText !== undefined) coupon.ribbonText = ribbonText.trim();
        if (isActive !== undefined) coupon.isActive = !!isActive;

        await coupon.save();
        return res.status(200).json({
            success: true,
            message: "Coupon Updated Successfully!",
            coupon: withComputedStatus(coupon.toObject())
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByIdAndDelete(id);
        if (!coupon) return res.status(404).json({ success: false, message: "Coupon Not Found!" });
        return res.status(200).json({ success: true, message: "Coupon Deleted Successfully!" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Public: the storefront's cart "Apply Coupon" box calls this to preview a
// discount before checkout — actually applying it happens again server-side
// in OrderController.prepareOrder, so a stale/tampered client-side result
// can never change what a customer is actually charged.
export const validateCoupon = async (req, res) => {
    try {
        const { code, cartTotal, site } = req.body;
        if (!code) return res.status(400).json({ success: false, message: "Please enter a coupon code." });

        const result = await resolveCouponDiscount(code, cartTotal, site);
        return res.status(200).json({ success: true, message: "Coupon applied!", ...result });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

// Public: the storefront's announcement ribbon polls this to know what (if
// anything) to advertise. Only ever returns a coupon that's both flagged
// showOnRibbon by the admin AND actually live right now, so a "featured"
// coupon never lingers on the ribbon after its own end date passes.
export const getRibbonCoupon = async (req, res) => {
    try {
        const { site } = req.query;
        const now = new Date();

        const filter = {
            showOnRibbon: true,
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        };
        if (SITES.includes(site)) filter.site = { $in: [site, "both"] };

        const coupon = await Coupon.findOne(filter).sort({ updatedAt: -1 }).lean();
        if (!coupon) return res.status(200).json({ success: true, coupon: null });

        return res.status(200).json({
            success: true,
            coupon: {
                code: coupon.code,
                discountType: coupon.discountType,
                value: coupon.value,
                ribbonText: buildRibbonText(coupon)
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
