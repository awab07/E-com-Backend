import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    street: {
        type: String,
        required: true,
        trim: true
    },

    city: {
        type: String,
        required: true,
        trim: true
    },

    province: {
        type: String,
        required: true,
        trim: true
    },

    postalCode: {
        type: String,
        trim: true
    },

    country: {
        type: String,
        required: true,
        trim: true
    }

}, { timestamps: true })

addressSchema.index({ user: 1, createdAt: -1 });

export const Address = mongoose.model("Address", addressSchema)
