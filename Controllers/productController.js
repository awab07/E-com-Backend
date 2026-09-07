// Controllers/productController.js
import { Product } from "../Model/productModel.js";
import getdatauri from "../Middleware/datauriparser.js";
import cloudinary from "../services/cloudinary.js";

const SITES = ["doubleapple", "triplebuzz", "both"];

// A product's stored discount.isActive is just the admin's on/off toggle — it
// says nothing about whether today actually falls inside startDate/endDate.
// This computes whether the discount is *live right now*, and the resulting
// price, using the same percentage/fixed math OrderController already applies
// at checkout — so what a storefront displays always matches what gets charged.
export function withEffectiveDiscount(product) {
    const d = product.discount;
    const now = new Date();

    const discountActive = !!(
        d && d.isActive && d.startDate && d.endDate &&
        now >= new Date(d.startDate) && now <= new Date(d.endDate)
    );

    let finalPrice = product.price;
    if (discountActive) {
        if (d.discountType === "percentage") {
            finalPrice = product.price - (product.price * d.value) / 100;
        } else if (d.discountType === "fixed") {
            finalPrice = product.price - d.value;
        }
    }
    finalPrice = Math.round(finalPrice * 100) / 100;

    return { ...product, discountActive, finalPrice };
}

export const ProductCreator = async (req, res) => {
    try {
        const { name, description, price, stock, category, site } = req.body;


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
            image,
            site: SITES.includes(site) ? site : "both"
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
        const start = performance.now();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const category = req.query.category || null;
        const search = req.query.search || null;
        const site = req.query.site || null;

        const filter = {};
        if (category) filter.category = category;
        if (search) filter.name = { $regex: search, $options: "i" };
        if (SITES.includes(site) && site !== "both") {
            // A product tagged "both" shows up for either storefront's site filter.
            // Products created before this field existed have no `site` at all —
            // they predate Triple Buzz entirely, so treat them as Double
            // Apple-only rather than surfacing old catalogue items on the new site.
            const matches = site === "doubleapple" ? [site, "both", null] : [site, "both"];
            filter.site = { $in: matches };
        }
        const skip = (page - 1) * limit;
        const dbStart = performance.now();
        const [products, totalItems] = await Promise.all([
            Product.find(filter).skip(skip).limit(limit).lean()
        ]);
        const dbTime = performance.now() - dbStart;

        console.log("DB TIME:", dbTime.toFixed(2), "ms");
        console.log("TOTAL TIME:", (performance.now() - start).toFixed(2), "ms");

        return res.status(200).json({
            success: true,
            message: "Products Fetched Successfully",
            currentPage: page,
            totalItems,
            itemsPerPage: limit,
            products: products.map((p) => withEffectiveDiscount({ ...p, site: p.site ?? "both" }))
        });
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
}

export const ProductUpdater = async (req, res) => {
    try {
        const { name, description, price, stock, category, site } = req.body || {};
        const { id } = req.params;

        // Required fields
        if (!name || !price || !stock || !category) {
            return res.status(400).json({
                success: false,
                message: "All fields are required!"
            });
        }

        
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

        // Only overwrite the site when a valid one is sent — omitting it (the
        // edit form always resends the current fields, but older callers may not
        // know about this field yet) must not silently reset it back to "both".
        if (SITES.includes(site)) updateData.site = site;

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
            product: { ...product, site: product.site ?? "both" }
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
        const product = await Product.findById(id).lean()
        if (!product) return res.status(404).json({ success: false, message: "Product Not Found!" })
        return res.status(200).json({ success: true, message: "Product Fetched Successfully!", product: withEffectiveDiscount({ ...product, site: product.site ?? "both" }) })
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