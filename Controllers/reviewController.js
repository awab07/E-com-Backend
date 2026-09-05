import { Review } from "../Model/ReviewModel.js";
import { Product } from "../Model/productModel.js";

const SITES = ["doubleapple", "triplebuzz"];

// Reviews created before the approval system shipped have no `status` field —
// treat those as already-approved instead of hiding them retroactively.
function isPubliclyVisible(review) {
    return review.status === "approved" || review.status === undefined;
}

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

        // Public reviews (approved, or legacy reviews from before this field existed)
        // plus — if the requester is logged in — their own review regardless of status,
        // so they can see it sitting in "pending" while it waits on admin approval.
        const visibilityFilter = { $or: [{ status: "approved" }, { status: { $exists: false } }] };
        const query = req.user
            ? { product: productId, $or: [...visibilityFilter.$or, { user: req.user.id }] }
            : { product: productId, ...visibilityFilter };

        const reviews = await Review.find(query)
            .sort(sort)
            .populate("user", "firstname lastname")
            .lean();

        return res.status(200).json({
            success: true,
            reviews,
            summary: summarize(reviews.filter(isPubliclyVisible))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const writeReview = async (req, res) => {
    try {
        const { productId } = req.params;
        const { rating, comment, site } = req.body;

        const ratingNum = Number(rating);
        if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
        }

        const product = await Product.findById(productId).lean();
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        // The submitting storefront tells us which site this review belongs to
        // (both Double Apple and Triple Buzz write to this same backend). Falls
        // back to Double Apple for older clients that don't send it yet.
        const resolvedSite = SITES.includes(site) ? site : "doubleapple";

        // Any new review, or an edit to an existing one, goes back to "pending" —
        // an admin has to approve the (possibly changed) content before it's public.
        const review = await Review.findOneAndUpdate(
            { product: productId, user: req.user.id },
            { rating: ratingNum, comment: comment?.trim() || "", status: "pending", site: resolvedSite },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).populate("user", "firstname lastname");

        return res.status(200).json({
            success: true,
            message: "Review submitted — it will be visible once an admin approves it.",
            review
        });
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

/* ================================
   ADMIN MODERATION
================================ */

export const getPendingReviews = async (req, res) => {
    try {
        const { site } = req.query;
        const filter = { status: "pending" };
        if (SITES.includes(site)) filter.site = site;

        const reviews = await Review.find(filter)
            .sort({ createdAt: -1 })
            .populate("user", "firstname lastname email")
            .populate("product", "name category")
            .lean();

        return res.status(200).json({ success: true, reviews });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateReviewStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ["pending", "approved", "rejected"];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status." });
        }

        const review = await Review.findByIdAndUpdate(id, { status }, { new: true })
            .populate("user", "firstname lastname")
            .populate("product", "name category");

        if (!review) return res.status(404).json({ success: false, message: "Review not found." });

        return res.status(200).json({ success: true, message: `Review ${status}.`, review });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
