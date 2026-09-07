import { Blog } from "../Model/BlogModel.js";
import getdatauri from "../Middleware/datauriparser.js";
import cloudinary from "../services/cloudinary.js";

const SITES = ["doubleapple", "triplebuzz", "both"];

function makeExcerpt(content) {
    const plain = content.replace(/\s+/g, " ").trim();
    return plain.length > 180 ? `${plain.slice(0, 180).trim()}...` : plain;
}

export const createBlog = async (req, res) => {
    try {
        const { title, content, excerpt, category, site } = req.body;

        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: "Title and content are required!"
            });
        }

        let image;
        if (req.file) {
            const fileuri = getdatauri(req.file);
            const cloud_res = await cloudinary.uploader.upload(fileuri, {
                folder: "blog_images"
            });
            image = { url: cloud_res.secure_url, public_id: cloud_res.public_id };
        }

        const blog = await Blog.create({
            title,
            content,
            excerpt: excerpt?.trim() || makeExcerpt(content),
            category,
            image,
            site: SITES.includes(site) ? site : "both",
            author: req.user.id
        });

        return res.status(201).json({
            success: true,
            message: "Blog Created Successfully!",
            blog
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllBlogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const category = req.query.category || null;
        const site = req.query.site || null;

        const filter = {};
        if (category) filter.category = category;
        if (SITES.includes(site) && site !== "both") {
            // A post targeted at "both" shows up for either storefront's site filter.
            // Posts written before this field existed have no `site` at all — they
            // predate Triple Buzz entirely, so treat them as Double Apple-only
            // rather than surfacing old Double Apple content on the new site.
            const matches = site === "doubleapple" ? [site, "both", null] : [site, "both"];
            filter.site = { $in: matches };
        }
        const skip = (page - 1) * limit;

        const [blogs, totalItems] = await Promise.all([
            Blog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("author", "firstname lastname")
                .lean(),
            Blog.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            message: "Blogs Fetched Successfully",
            currentPage: page,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
            itemsPerPage: limit,
            blogs
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getBlogById = async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findById(id).populate("author", "firstname lastname").lean();
        if (!blog) return res.status(404).json({ success: false, message: "Blog not found!" });
        return res.status(200).json({ success: true, blog });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, excerpt, category, site } = req.body;

        const blog = await Blog.findById(id);
        if (!blog) return res.status(404).json({ success: false, message: "Blog not found!" });

        if (title?.trim()) blog.title = title.trim();
        if (content?.trim()) blog.content = content.trim();
        if (excerpt?.trim()) blog.excerpt = excerpt.trim();
        if (category?.trim()) blog.category = category.trim();
        if (SITES.includes(site)) blog.site = site;

        if (req.file) {
            if (blog.image?.public_id) {
                await cloudinary.uploader.destroy(blog.image.public_id);
            }
            const fileuri = getdatauri(req.file);
            const cloud_res = await cloudinary.uploader.upload(fileuri, {
                folder: "blog_images"
            });
            blog.image = { url: cloud_res.secure_url, public_id: cloud_res.public_id };
        }

        await blog.save();

        return res.status(200).json({
            success: true,
            message: "Blog Updated Successfully!",
            blog
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findById(id);
        if (!blog) return res.status(404).json({ success: false, message: "Blog not found!" });

        if (blog.image?.public_id) {
            await cloudinary.uploader.destroy(blog.image.public_id);
        }

        await Blog.findByIdAndDelete(id);
        return res.status(200).json({ success: true, message: "Blog Deleted Successfully!" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
