import mongoose from "mongoose";

const productSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
    },

    description: {
        type: String
    },
    discount: {
        isActive: {
            type: Boolean,
            default: false
        },
        discountType: {
            type: String,
            enum: ["percentage", "fixed"],
            default: "percentage"
        },
        value: {
            type: Number,
            default: 0
        },
        startDate: Date,
        endDate: Date
    },

    price: {
        type: Number,
        required: true
    },

    stock: {
        type: Number,
        required: true
    },

    image: [
        {
            url: {
                type: String,
                required: true
            },
            // Only present for admin-uploaded images (the Cloudinary asset id,
            // needed to delete them later). POS-synced products hot-link the
            // Lightspeed CDN directly and have no Cloudinary asset, so this is
            // optional rather than required.
            public_id: {
                type: String
            }
        }
    ],

    category: {
        type: String,
        required: true,
        index: true
    },
    brand: {
        type: String
    },

    // Which storefront(s) this product should appear on — Double Apple and
    // Triple Buzz share this backend/catalogue but a product can be scoped to
    // just one of them (or both, the default).
    site: {
        type: String,
        enum: ["doubleapple", "triplebuzz", "both"],
        default: "both"
    },

    // Set only for products synced in from a POS (Lightspeed) catalogue —
    // the POS's own product id, used as the upsert key on every re-sync so
    // running it again updates the same record instead of duplicating it.
    posId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    posSyncedAt: Date,

    // false once the item is deactivated/deleted in the POS. Such products
    // keep their record (past orders reference it) but are hidden from
    // listings and have stock 0. Unset on products that never came from a POS.
    posActive: Boolean

}, { timestamps: true })

productSchema.index({
    createdAt: -1,
    _id: -1
});

productSchema.index({
    category: 1,
    createdAt: -1,
    _id: -1
});

productSchema.index({
    name: "text",
    description: "text",
    brand: "text"
});

productSchema.index({ site: 1 });
export const Product = mongoose.model("Product", productSchema)