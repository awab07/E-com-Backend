import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    firstname: {
        type: String,
        required: true,
        match: /^[a-zA-Z\s]+$/,
        minlength: 2,
        trim: true
    },
    lastname: {
        type: String,
        match: /^[a-zA-Z\s]+$/,
        minlength: 2,
        trim: true
    },
    gender: {
        type: String,
        enum: ["male", "female", "other"]
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
        required: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
    },
    phno: {
        type: String,
        unique: true,
        required: true
    },
    address: {
        street: String,
        city: String,
        province: String,
        postalCode: String,
        country: String
    },
    avatar: {
        url: { type: String },
        public_id: { type: String }
    },
    isverified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: false
    },
    otp: {
        type: String,
        default: null
    },
    otp_expiry: {
        type: Date,
        default: null
    },

    refreshToken: {
        type: String,
        default: null
    },
    refreshTokenExpiry: {
        type: Date,
        default: null
    }

}, { timestamps: true })


userSchema.index({ createdAt: -1 });
userSchema.index({ refreshToken: 1 });

export const User = mongoose.model("User", userSchema)