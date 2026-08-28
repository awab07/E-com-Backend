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
        const page     = parseInt(req.query.page)  || 1;
        const limit    = parseInt(req.query.limit) || 10;
        const category = req.query.category        || null;
        const search   = req.query.search          || null;

        const filter = {};
        if (category) filter.category = category;
        if (search)   filter.name = { $regex: search, $options: "i" }; 
        const skip = (page - 1) * limit;
        const [products, totalItems] = await Promise.all([
            Product.find(filter).skip(skip).limit(limit),
            Product.countDocuments(filter)
        ]);

        return res.status(200).json({
            success:     true,
            message:     "Products Fetched Successfully",
            currentPage: page,
            totalPages:  Math.ceil(totalItems / limit),
            totalItems,
            itemsPerPage: limit,
            products
        });
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
}

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