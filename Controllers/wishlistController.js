import { Wishlist } from "../Model/WishlistModel.js";
import { Product } from "../Model/productModel.js";
import { withEffectiveDiscount } from "./productController.js";

export const getMyWishlist = async (req, res) => {
    try {
        const items = await Wishlist.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .populate("product")
            .lean();

        // A wishlisted product can be deleted later — drop those entries
        // rather than surfacing a null product to the frontend.
        const products = items
            .filter((item) => item.product)
            .map((item) => withEffectiveDiscount(item.product));

        return res.status(200).json({ success: true, products });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.params;

        const product = await Product.findById(productId).lean();
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        try {
            await Wishlist.create({ user: req.user.id, product: productId });
        } catch (error) {
            if (error.code !== 11000) throw error; // already wishlisted — idempotent success
        }

        return res.status(200).json({ success: true, message: "Added to wishlist." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        await Wishlist.findOneAndDelete({ user: req.user.id, product: productId });
        return res.status(200).json({ success: true, message: "Removed from wishlist." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
