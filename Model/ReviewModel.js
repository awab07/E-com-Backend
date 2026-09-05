import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({

    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    comment: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
    },

    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },

    // Which storefront the review was submitted from — both Double Apple and
    // Triple Buzz share this backend, so moderation needs to tell them apart.
    site: {
        type: String,
        enum: ["doubleapple", "triplebuzz"],
        default: "doubleapple"
    }

}, { timestamps: true })

// One review per user per product — writeReview upserts against this.
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ site: 1 });

export const Review = mongoose.model("Review", reviewSchema)
