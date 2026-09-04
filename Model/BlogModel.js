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
    }

}, { timestamps: true })

blogSchema.index({ createdAt: -1 });
blogSchema.index({ title: "text", excerpt: "text", content: "text" });

export const Blog = mongoose.model("Blog", blogSchema)
