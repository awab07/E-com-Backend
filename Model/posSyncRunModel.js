import mongoose from "mongoose";

// A record of one syncPOSProducts invocation, so the admin portal's
// "Sync runs" screen has real history to show instead of guessing from
// Product.posSyncedAt alone (which only ever reflects the single most
// recent run, not the run-by-run trail).
const posSyncRunSchema = new mongoose.Schema({
    site: {
        type: String,
        enum: ["triplebuzz", "doubleapple"],
        required: true,
        index: true
    },
    startedAt: { type: Date, required: true },
    finishedAt: Date,
    durationMs: Number,
    status: {
        type: String,
        enum: ["success", "partial", "failed", "skipped"],
        default: "success"
    },
    // "partial" = time budget reached, more left to sync (done:false).
    // "skipped" = the site was disabled when this run was requested.
    done: Boolean,
    resumeAfter: mongoose.Schema.Types.Mixed,
    processed: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skippedInactive: { type: Number, default: 0 },
    message: String
}, { timestamps: true });

posSyncRunSchema.index({ site: 1, startedAt: -1 });

export const PosSyncRun = mongoose.model("PosSyncRun", posSyncRunSchema);
