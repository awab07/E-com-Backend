import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({

    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },

    discountType: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage"
    },

    value: {
        type: Number,
        required: true
    },

    startDate: {
        type: Date,
        required: true
    },

    endDate: {
        type: Date,
        required: true
    },

    // Admin on/off switch — separate from the start/end window so a coupon
    // can be paused without losing its configured dates. Whether the coupon
    // is *live right now* is computed from this + the dates at read time
    // (see withComputedStatus in couponController.js), so it "automatically
    // deactivates" the moment endDate passes without needing a cron job.
    isActive: {
        type: Boolean,
        default: true
    },

    minOrderAmount: {
        type: Number,
        default: 0
    },

    // Which storefront(s) this coupon can be used on — same pattern
    // Product/Blog/Review already use to share this backend across sites.
    site: {
        type: String,
        enum: ["doubleapple", "triplebuzz", "both"],
        default: "both"
    },

    // The admin's "feature this on the announcement ribbon" switch.
    showOnRibbon: {
        type: Boolean,
        default: false
    },

    // Optional custom ribbon copy — falls back to an auto-generated
    // "USE CODE X FOR Y% OFF" line (see buildRibbonText) when left blank.
    ribbonText: {
        type: String,
        trim: true,
        default: ""
    }

}, { timestamps: true })

couponSchema.index({ showOnRibbon: 1, site: 1 });

export const Coupon = mongoose.model("Coupon", couponSchema)
