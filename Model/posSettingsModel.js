import mongoose from "mongoose";

// One document per storefront's Lightspeed connection — the on/off switch
// the admin portal's "temporarily disable" control reads and writes.
// Sync stays possible at the code level even when disabled; syncPOSProducts
// is what actually refuses to run while a site is flagged off.
const posSettingsSchema = new mongoose.Schema({
    site: {
        type: String,
        enum: ["triplebuzz", "doubleapple"],
        required: true,
        unique: true
    },
    enabled: {
        type: Boolean,
        default: true
    },
    disabledAt: Date,
    disabledBy: String,

    // Background auto-sync (services/posAutoSync.js) bookkeeping.
    // productSyncCursor: Lightspeed's product version high-water mark, so each
    // cycle only fetches what changed since. autoSyncLockUntil: a short lease
    // so two server instances never run a cycle for the same site at once.
    productSyncCursor: Number,
    autoSyncLockUntil: Date,
    lastFullSyncAt: Date,
    lastAutoSyncAt: Date,
    lastAutoSyncSummary: mongoose.Schema.Types.Mixed,
    lastAutoSyncError: String,
    lastAutoSyncErrorAt: Date
}, { timestamps: true });

export const PosSettings = mongoose.model("PosSettings", posSettingsSchema);
