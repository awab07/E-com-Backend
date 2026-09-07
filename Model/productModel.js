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
            public_id: {
                type: String,
                required: true
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
    }

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