import { Review } from "../Model/ReviewModel.js";
import { Product } from "../Model/productModel.js";

function summarize(reviews) {
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    for (const r of reviews) {
        breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
        sum += r.rating;
    }
    const total = reviews.length;
    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
    return { average, total, breakdown };
}

export const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const sort = req.query.sort === "rating" ? { rating: -1, createdAt: -1 } : { createdAt: -1 };

        const reviews = await Review.find({ product: productId })
            .sort(sort)
            .populate("user", "firstname lastname")
            .lean();

        return res.status(200).json({
            success: true,
            reviews,
            summary: summarize(reviews)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const writeReview = async (req, res) => {
    try {
        const { productId } = req.params;
        const { rating, comment } = req.body;

        const ratingNum = Number(rating);
        if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
        }

        const product = await Product.findById(productId).lean();
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        const review = await Review.findOneAndUpdate(
            { product: productId, user: req.user.id },
            { rating: ratingNum, comment: comment?.trim() || "" },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).populate("user", "firstname lastname");

        return res.status(200).json({ success: true, message: "Review saved.", review });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteReview = async (req, res) => {
    try {
        const { productId } = req.params;
        await Review.findOneAndDelete({ product: productId, user: req.user.id });
        return res.status(200).json({ success: true, message: "Review deleted." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .populate("product", "name category")
            .lean();

        return res.status(200).json({ success: true, reviews });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
