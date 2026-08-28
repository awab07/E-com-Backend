// Controllers/productController.js
import { Product } from "../Model/productModel.js";
import getdatauri from "../Middleware/datauriparser.js";
import cloudinary from "../services/cloudinary.js";

export const ProductCreator = async (req, res) => {
    try {
        const { name, description, price, stock, category } = req.body
        const existedProduct = await Product.findOne({ name, category })
        if (existedProduct) return res.status(409).json({ message: "Product Already in the Database!" })
        if (!name || !price || !stock || !category) return res.status(400).json({ message: "Please fill the required fields!" })
        if (description && description.length < 10) return res.status(400).json({ message: "Description must be 10 characters long!" })
        if (price <= 0) return res.status(400).json({ message: "Price must be greater than 0!" })
        if (stock < 0) return res.status(400).json({ message: "Stock must be Greater than 0!" })

        let image = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const fileuri = getdatauri(file);
                const cloud_res = await cloudinary.uploader.upload(fileuri, {
                    folder: "product_images",
                });
                image.push({
                    url: cloud_res.secure_url,
                    public_id: cloud_res.public_id,
                });
            }
        }

        const newProduct = await Product.create({ name, description, price, stock, category, image })
        return res.status(201).json({ success: true, message: "Product Created Successfully", newProduct })
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
}

export const getAllProducts = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        const category = req.query.category?.trim() || null;
        const search = req.query.search?.trim() || null;
        const cursor = req.query.cursor || null;

        const filter = {};

        // Category filter
        if (category) {
            filter.category = category;
        }

        // Search filter
        if (search) {
            filter.$text = { $search: search };
        }

        // Cursor filter
        if (cursor) {
            const decodedCursor = JSON.parse(
                Buffer.from(cursor, "base64").toString("utf-8")
            );

            filter.$or = [
                {
                    createdAt: {
                        $lt: new Date(decodedCursor.createdAt)
                    }
                },
                {
                    createdAt: new Date(decodedCursor.createdAt),
                    _id: {
                        $lt: decodedCursor._id
                    }
                }
            ];
        }

        const products = await Product.find(filter)
            .select("name description price stock image category brand discount createdAt")
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean();

        const hasNext = products.length > limit;

        if (hasNext) {
            products.pop();
        }

        let nextCursor = null;

        if (hasNext && products.length > 0) {
            const lastProduct = products[products.length - 1];

            const cursorData = {
                createdAt: lastProduct.createdAt,
                _id: lastProduct._id
            };

            nextCursor = Buffer.from(
                JSON.stringify(cursorData)
            ).toString("base64");
        }

        return res.status(200).json({
            success: true,
            message: "Products Fetched Successfully",
            itemsPerPage: limit,
            hasNext,
            nextCursor,
            products
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
export const ProductUpdater = async (req, res) => {
    try {
        const { name, description, price, stock, category } = req.body;
        const { id } = req.params;

        if (!name || !price || !stock || !category) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }

        const old_product = await Product.findById(id);
        if (!old_product) {
            return res.status(404).json({ success: false, message: "Product Not Found!" });
        }

        let newImages = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const fileuri = getdatauri(file);
                const cloud_res = await cloudinary.uploader.upload(fileuri, { folder: "product_images" });
                newImages.push({ public_id: cloud_res.public_id, url: cloud_res.secure_url });
            }
        }

        const updatedImages = [...(old_product.image || []), ...newImages];

        const product = await Product.findByIdAndUpdate(
            id,
            { name, description, price, stock, category, image: updatedImages },
            { new: true }
        );

        return res.status(200).json({ success: true, message: "Product Updated Successfully!", product });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const ProductDeleter = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id)
        if (!product) return res.status(404).json({ success: false, message: "Product Not Found!" })

        if (product.image && product.image.length > 0) {
            for (const image of product.image) {
                await cloudinary.uploader.destroy(image.public_id)
            }
        }

        await Product.findByIdAndDelete(id);
        return res.status(200).json({ success: true, message: "Product Deleted Successfully!" })
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
}

export const FindProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id)
        if (!product) return res.status(404).json({ success: false, message: "Product Not Found!" })
        return res.status(200).json({ success: true, message: "Product Fetched Successfully!", product })
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message })
    }
}

export const imageDeletor = async (req, res) => {
    try {
        const { id } = req.params;
        const { imageId } = req.query;

        const product = await Product.findById(id);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        const imagetodelete = product.image.find(img => img.public_id === imageId);
        if (!imagetodelete) return res.status(404).json({ success: false, message: "Image not found" });

        await cloudinary.uploader.destroy(imagetodelete.public_id);
        product.image = product.image.filter(img => img.public_id !== imageId);
        await product.save();

        return res.status(200).json({ success: true, message: "Image deleted successfully", images: product.image });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};