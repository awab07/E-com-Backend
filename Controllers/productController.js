// Controllers/productController.js
import { Product } from "../Model/productModel.js";
import getdatauri from "../Middleware/datauriparser.js";
import cloudinary from "../services/cloudinary.js";

export const ProductCreator = async (req, res) => {
    try {
        const { name, description, price, stock, category } = req.body;

        
        if (!name || !price || stock === undefined || !category) {
            return res.status(400).json({
                success: false,
                message: "Please fill the required fields!"
            });
        }

        // Validate values
        if (description && description.length < 10) {
            return res.status(400).json({
                success: false,
                message: "Description must be 10 characters long!"
            });
        }

        if (price <= 0) {
            return res.status(400).json({
                success: false,
                message: "Price must be greater than 0!"
            });
        }

        if (stock < 0) {
            return res.status(400).json({
                success: false,
                message: "Stock must be greater than or equal to 0!"
            });
        }

        
        const existedProduct = await Product.findOne({
            name,
            category
        }).lean();

        if (existedProduct) {
            return res.status(409).json({
                success: false,
                message: "Product Already in the Database!"
            });
        }

        
        let image = [];

        if (req.files && req.files.length > 0) {

            image = await Promise.all(
                req.files.map(async (file) => {

                    const fileuri = getdatauri(file);

                    const cloud_res = await cloudinary.uploader.upload(
                        fileuri,
                        {
                            folder: "product_images"
                        }
                    );

                    return {
                        url: cloud_res.secure_url,
                        public_id: cloud_res.public_id
                    };
                })
            );
        }

        
        const newProduct = await Product.create({
            name,
            description,
            price,
            stock,
            category,
            image
        });

        return res.status(201).json({
            success: true,
            message: "Product Created Successfully",
            newProduct
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getAllProducts = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        const category = req.query.category?.trim() || null;
        const search = req.query.search?.trim() || null;

        const filter = {};

        // Category filter
        if (category) {
            filter.category = category;
        }

        // Search
        if (search) {
            filter.$text = { $search: search };
        }

        const skip = (page - 1) * limit;

        const [products, totalItems] = await Promise.all([
            Product.find(filter)
                .select("name description price stock image category brand discount createdAt")
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            Product.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            message: "Products Fetched Successfully",
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems,
            itemsPerPage: limit,
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

        // Required fields
        if (!name || !price || !stock || !category) {
            return res.status(400).json({
                success: false,
                message: "All fields are required!"
            });
        }

        // Upload all images at the same time
        let newImages = [];

        if (req.files && req.files.length > 0) {

            newImages = await Promise.all(
                req.files.map(async (file) => {

                    const fileuri = getdatauri(file);

                    const cloud_res = await cloudinary.uploader.upload(
                        fileuri,
                        {
                            folder: "product_images"
                        }
                    );

                    return {
                        public_id: cloud_res.public_id,
                        url: cloud_res.secure_url
                    };
                })
            );
        }

        // Update product
        const updateData = {
            name,
            description,
            price,
            stock,
            category
        };

        // Only modify images when new images are uploaded
        if (newImages.length > 0) {
            updateData.$push = {
                image: {
                    $each: newImages
                }
            };
        }

        const product = await Product.findByIdAndUpdate(
            id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        ).lean();

        // Product doesn't exist
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product Not Found!"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Product Updated Successfully!",
            product
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
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