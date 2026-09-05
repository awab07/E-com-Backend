import mongoose from "mongoose";

const blogSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true,
        trim: true
    },

    excerpt: {
        type: String,
        trim: true,
        maxlength: 300
    },

    content: {
        type: String,
        required: true
    },

    category: {
        type: String,
        trim: true,
        default: "Smoke Shop in Austin"
    },

    image: {
        url: {
            type: String
        },
        public_id: {
            type: String
        }
    },

    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    // Which storefront(s) this post should appear on — Double Apple and Triple
    // Buzz share this backend but publish separate blogs.
    site: {
        type: String,
        enum: ["doubleapple", "triplebuzz", "both"],
        default: "both"
    }

}, { timestamps: true })

blogSchema.index({ createdAt: -1 });
blogSchema.index({ site: 1 });
blogSchema.index({ title: "text", excerpt: "text", content: "text" });

export const Blog = mongoose.model("Blog", blogSchema)
