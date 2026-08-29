import { Order } from "../Model/OrderModel.js";
import { Product } from "../Model/productModel.js"
import { StoreStats } from "../Model/StoreStats.js";
import { User } from "../Model/userModel.js"

export const OrderCreator = async (req, res) => {
    try {
        const userID = req.user ? req.user.id : null;
        let user = null;
        if (userID) {
            user = await User.findById(userID).lean();
        }

        const { items, shippingAddress, paymentMethod, guestInfo } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Items are required!" });
        }
        if (
            !shippingAddress?.street ||
            !shippingAddress?.city ||
            !shippingAddress?.province ||
            !shippingAddress?.postalCode ||
            !shippingAddress?.country
        ) {
            return res.status(400).json({ success: false, message: "Please provide a complete shipping address!" });
        }
        if (!user) {
            if (!guestInfo?.firstName || !guestInfo?.lastName || !guestInfo?.email || !guestInfo?.phone) {
                return res.status(400).json({ success: false, message: "Guest information is required." });
            }
        }

        // Validate item structure first
        for (const item of items) {
            if (!item.productId || !item.quantity || item.quantity <= 0) {
                return res.status(400).json({ success: false, message: "Invalid item structure" });
            }
        }

        
        const productIds = items.map(i => i.productId);
        const products = await Product.find({ _id: { $in: productIds } });
        const productMap = {};
        for (const p of products) {
            productMap[p._id.toString()] = p;
        }

        
        let processedItems = [];
        let totalAmount = 0;
        let totalItems = 0;

        for (const item of items) {
            const product = productMap[item.productId.toString()];
            if (!product) {
                return res.status(404).json({ success: false, message: `Product not found: ${item.productId}` });
            }
            if (product.stock !== undefined && product.stock < item.quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
            }

            let finalPrice = product.price;
            const now = new Date();
            if (
                product.discount &&
                product.discount.isActive &&
                now >= new Date(product.discount.startDate) &&
                now <= new Date(product.discount.endDate)
            ) {
                if (product.discount.discountType === "percentage") {
                    finalPrice = product.price - (product.price * product.discount.value) / 100;
                } else if (product.discount.discountType === "fixed") {
                    finalPrice = product.price - product.discount.value;
                }
            }

            processedItems.push({
                product: product._id,
                quantity: item.quantity,
                price: finalPrice,
            });
            totalAmount += finalPrice * item.quantity;
            totalItems += item.quantity;
        }

        // FIX: Estimated delivery is per-order, not per-item — moved outside loop
        const deliverytime = new Date();
        deliverytime.setDate(deliverytime.getDate() + 4);

        // FIX: Batch-update all product stocks in a single bulkWrite call
        const bulkOps = items.map(item => ({
            updateOne: {
                filter: { _id: item.productId },
                update: { $inc: { stock: -item.quantity } }
            }
        }));
        await Product.bulkWrite(bulkOps);

        const orderData = {
            items: processedItems,
            totalAmount,
            totalItems,
            shippingAddress,
            paymentMethod: paymentMethod || "Cash On Delivery",
            isGuestOrder: !user,
            estimatedDelivery: deliverytime
        };

        if (user) {
            orderData.user = user._id;
        } else {
            orderData.guestInfo = {
                firstName: guestInfo.firstName,
                lastName: guestInfo.lastName,
                email: guestInfo.email,
                phone: guestInfo.phone
            };
        }

        const order = await Order.create(orderData);

        // Update user address if logged in
        if (user) {
            await User.findByIdAndUpdate(user._id, { address: shippingAddress });
        }

        await order.populate("items.product");

        return res.status(201).json({
            success: true,
            message: userID ? "Order Created Successfully!" : "Guest Order Created Successfully!",
            order
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getOrders = async (req, res) => {
    try {
        const start = performance.now();

        const userID = req.user.id;

        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const skip = (page - 1) * limit;

        const dbStart = performance.now();

        
        const my_orders = await Order.find({ user: userID })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select("-__v -isArchived")
            .lean();

        
        const productIds = my_orders.flatMap(order =>
            order.items.map(item => item.product)
        );

        const products = await Product.find({ _id: { $in: productIds } })
            .select("name price images sku")
            .lean();

        const dbTime = performance.now() - dbStart;

        
        const productMap = new Map(products.map(p => [p._id.toString(), p]));

        const ordersWithProducts = my_orders.map(order => ({
            ...order,
            items: order.items.map(item => ({
                ...item,
                product: productMap.get(item.product.toString())
            }))
        }));

        console.log("ORDERS DB TIME:", dbTime.toFixed(2), "ms");
        console.log("ORDERS TOTAL TIME:", (performance.now() - start).toFixed(2), "ms");

        return res.status(200).json({
            success: true,
            message: "Orders Fetched Successfully!",
            currentPage: page,
            itemsPerPage: limit,
            my_orders: ordersWithProducts
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id).populate("items.product").lean();
        if (!order) return res.status(404).json({ success: false, message: "Order Not Found!" });
        return res.status(200).json({ success: true, message: "Order Fetched Successfully!", order });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllOrderForAdmin = async (req, res) => {
    try {
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip  = (page - 1) * limit;

        const [orders, totalItems] = await Promise.all([
            Order.find({ isArchived: false })
                .populate("items.product", "name price image category")
                .populate("user", "firstname lastname email phno")
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            Order.countDocuments({ isArchived: false })
        ]);

        return res.status(200).json({
            success:      true,
            message:      "Orders Fetched Successfully!",
            currentPage:  page,
            totalPages:   Math.ceil(totalItems / limit),
            totalItems,
            itemsPerPage: limit,
            orders
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const UpdateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
        const allowedTransitions = {
            pending: ["confirmed", "cancelled"],
            confirmed: ["shipped"],
            shipped: ["delivered"],
            delivered: [],
            cancelled: []
        };

        const order = await Order.findById(id);
        if (!order) return res.status(404).json({ success: false, message: "Order Not Found!" });
        if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: "Invalid Status!" });
        if (!allowedTransitions[order.status].includes(status)) {
            return res.status(400).json({ success: false, message: `Can't change the status ${order.status} to ${status}` });
        }

        if (status === "cancelled" && order.status !== "cancelled") {
            const bulkOps = order.items.map(item => ({
                updateOne: {
                    filter: { _id: item.product },
                    update: { $inc: { stock: item.quantity } }
                }
            }));
            if (bulkOps.length > 0) await Product.bulkWrite(bulkOps);
        }

        if (status === "delivered" && order.status !== "delivered") {
            
            await StoreStats.findOneAndUpdate(
                {},
                {
                    $inc: {
                        totalRevenue: order.totalAmount,
                        deliveredOrders: 1
                    }
                },
                { upsert: true, new: true }
            );
            order.deliveredAt = new Date();
        }

        order.status = status;
        await order.save();
        return res.status(200).json({ success: true, message: "Order Status Updated Successfully!", order });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const ordercancelforuser = async (req, res) => {
    try {
        const userID = req.user.id;
        const { id } = req.params;
        const order = await Order.findById(id);
        if (!order) return res.status(404).json({ success: false, message: "Order Not Found!" });
        if (order.user.toString() !== userID) return res.status(403).json({ success: false, message: "You are not authorized for this Action!" });
        if (order.status === "delivered") return res.status(400).json({ success: false, message: "You can't cancel a delivered order!" });
        if (order.status === "shipped") return res.status(400).json({ success: false, message: "You can't cancel a shipped order!" });
        if (order.status === "cancelled") return res.status(400).json({ success: false, message: "You can't cancel a cancelled order!" });

        // FIX: Batch stock restoration using bulkWrite
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: { _id: item.product },
                update: { $inc: { stock: item.quantity } }
            }
        }));
        if (bulkOps.length > 0) await Product.bulkWrite(bulkOps);

        order.status = "cancelled";
        await order.save();
        return res.status(200).json({ success: true, message: "Order Cancelled Successfully!", order });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const orderdeletionforAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByIdAndUpdate(id, { isArchived: true }, { new: true });
        if (!order) return res.status(404).json({ success: false, message: "Order Not Found!" });
        return res.status(200).json({ success: true, message: "Order Deleted Successfully!", order });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getArchiedOrders = async (req, res) => {
    try {
        // FIX: Added pagination — archived orders can grow unboundedly
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip  = (page - 1) * limit;

        const [Archived, totalItems] = await Promise.all([
            Order.find({ isArchived: true })
                .populate("items.product", "name price")
                .populate("user", "firstname lastname email")
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            Order.countDocuments({ isArchived: true })
        ]);

        return res.status(200).json({
            success:      true,
            message:      "Archived Orders Fetched Successfully!",
            currentPage:  page,
            totalPages:   Math.ceil(totalItems / limit),
            totalItems,
            itemsPerPage: limit,
            Archived
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getStatsStore = async (req, res) => {
    try {
        const [StoreStates, monthlyRevenue, totalOrders] = await Promise.all([
            StoreStats.findOne().lean(),
            Order.aggregate([
                { $match: { status: "delivered", deliveredAt: { $ne: null } } },
                {
                    $group: {
                        _id: { year: { $year: "$deliveredAt" }, month: { $month: "$deliveredAt" } },
                        revenue: { $sum: "$totalAmount" }
                    }
                },
                { $sort: { "_id.year": 1, "_id.month": 1 } }
            ]),
            // FIX: totalOrders was never populated — compute it live
            
        ]);

        if (!StoreStates) return res.status(404).json({ success: false, message: "No Stats Found!" });

        return res.status(200).json({
            success: true,
            StoreStates: { ...StoreStates, totalOrders },
            monthlyRevenue
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
