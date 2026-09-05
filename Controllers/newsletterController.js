import { NewsletterSubscriber } from "../Model/NewsletterModel.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const subscribeNewsletter = async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();

        if (!email || !EMAIL_RE.test(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        const existing = await NewsletterSubscriber.findOne({ email }).lean();
        if (existing) {
            return res.status(200).json({ success: true, message: "You're already on the list!" });
        }

        await NewsletterSubscriber.create({ email });

        return res.status(201).json({ success: true, message: "You're on the list! Watch your inbox for exclusive offers." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllSubscribers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [subscribers, totalItems] = await Promise.all([
            NewsletterSubscriber.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            NewsletterSubscriber.countDocuments()
        ]);

        return res.status(200).json({
            success: true,
            message: "Subscribers Fetched Successfully",
            currentPage: page,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
            itemsPerPage: limit,
            subscribers
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteSubscriber = async (req, res) => {
    try {
        const { id } = req.params;
        const subscriber = await NewsletterSubscriber.findByIdAndDelete(id);
        if (!subscriber) return res.status(404).json({ success: false, message: "Subscriber not found!" });
        return res.status(200).json({ success: true, message: "Subscriber removed." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
