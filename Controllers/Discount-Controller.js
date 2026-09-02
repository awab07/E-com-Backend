import { Product } from "../Model/productModel.js"

export const discountController = async (req, res) => {
    try {
        const { id } = req.params
        const { isActive, value, startDate, endDate, discountType } = req.body
        const validDiscountType = ["percentage", "fixed"]

        const product = await Product.findById(id)
        if (!product) return res.status(404).json({ success: false, message: "Product Not Found!" })

        if (isActive === false) {
            product.discount = {
                isActive: false,
                discountType: "percentage",
                value: 0,
                startDate: null,
                endDate: null
            };
            await product.save();
            return res.status(200).json({ success: true, message: "Discount Disabled Successfully!" });
        }

        if (!value || !startDate || !endDate || !discountType) {
            return res.status(400).json({ success: false, message: "Please Fill All the Fields!" })
        }
        if (!validDiscountType.includes(discountType)) {
            return res.status(400).json({ success: false, message: "Invalid Discount Type or Discount Type is Not Supported!" })
        }
        if (discountType === "percentage" && (value < 1 || value > 100)) {
            return res.status(400).json({ success: false, message: "Percentile must be between 1 and 100" })
        }
        // FIX: Typo corrected ("acuall" → "actual")
        if (discountType === "fixed" && value >= product.price) {
            return res.status(400).json({ success: false, message: "Fixed discount must be less than the actual product price!" })
        }
        if (new Date(startDate) >= new Date(endDate)) {
            return res.status(400).json({ success: false, message: "End date must be after start date." });
        }
        if (new Date(endDate) < new Date()) {
            return res.status(400).json({ success: false, message: "End date must be in the future." });
        }

        product.discount = { isActive, discountType, value, startDate, endDate }
        await product.save()
        return res.status(200).json({ success: true, message: "Discount Added to product!" })
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message })
    }
}
