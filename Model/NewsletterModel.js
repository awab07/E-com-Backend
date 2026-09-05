import mongoose from "mongoose";

const newsletterSchema = new mongoose.Schema({

    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    }

}, { timestamps: true })

export const NewsletterSubscriber = mongoose.model("NewsletterSubscriber", newsletterSchema)
