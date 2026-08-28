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
        enum: ["electronics", "clothing", "food", "books"]
    },
    brand: {
        type: String
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
export const Product = mongoose.model("Product", productSchema)