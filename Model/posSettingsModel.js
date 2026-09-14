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
    disabledBy: String
}, { timestamps: true });

export const PosSettings = mongoose.model("PosSettings", posSettingsSchema);
