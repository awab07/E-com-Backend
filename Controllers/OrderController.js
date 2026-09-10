import { Order } from "../Model/OrderModel.js";
import { Product } from "../Model/productModel.js"
import { StoreStats } from "../Model/StoreStats.js";
import { User } from "../Model/userModel.js"
import { Address } from "../Model/AddressModel.js"
import { createPaypalOrder, capturePaypalOrder } from "../services/paypal.js"
import { chargeCreditCard, verifyWebhookSignature } from "../services/authorizeNet.js"

class OrderValidationError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Shared by OrderCreator and the PayPal flow: validates the cart/address/guest
// info, prices items against current stock+discounts, and reserves stock.
// Does NOT create the Order document — callers decide paymentMethod/paymentStatus.
async function prepareOrder(req) {
    const userID = req.user ? req.user.id : null;
    let user = null;
    if (userID) {
        user = await User.findById(userID).lean();
    }

    const { items, shippingAddress, guestInfo } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        throw new OrderValidationError(400, "Items are required!");
    }
    if (
        !shippingAddress?.street ||
        !shippingAddress?.city ||
        !shippingAddress?.province ||
        !shippingAddress?.postalCode ||
        !shippingAddress?.country
    ) {
        throw new OrderValidationError(400, "Please provide a complete shipping address!");
    }
    if (!user) {
        if (!guestInfo?.firstName || !guestInfo?.lastName || !guestInfo?.email || !guestInfo?.phone) {
            throw new OrderValidationError(400, "Guest information is required.");
        }
    }

    // Validate item structure first
    for (const item of items) {
        if (!item.productId || !item.quantity || item.quantity <= 0) {
            throw new OrderValidationError(400, "Invalid item structure");
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
            throw new OrderValidationError(404, `Product not found: ${item.productId}`);
        }
        if (product.stock !== undefined && product.stock < item.quantity) {
            throw new OrderValidationError(400, `Insufficient stock for ${product.name}`);
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

    const deliverytime = new Date();
    deliverytime.setDate(deliverytime.getDate() + 4);

    const bulkOps = items.map(item => ({
        updateOne: {
            filter: { _id: item.productId },
            update: { $inc: { stock: -item.quantity } }
        }
    }));
    await Product.bulkWrite(bulkOps);

    return { user, processedItems, totalAmount, totalItems, shippingAddress, guestInfo, deliverytime };
}

async function saveShippingAddress(user, shippingAddress) {
    await User.findByIdAndUpdate(user._id, { address: shippingAddress });

    // Save this shipping address to the user's address book too,
    // unless the exact same address is already saved there.
    await Address.findOneAndUpdate(
        {
            user: user._id,
            street: shippingAddress.street,
            city: shippingAddress.city,
            province: shippingAddress.province,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country
        },
        { $setOnInsert: { user: user._id, ...shippingAddress } },
        { upsert: true, new: true }
    );
}

// Restores stock for an order that never got paid for (failed/expired PayPal capture).
async function restoreStock(processedItems) {
    const bulkOps = processedItems.map(item => ({
        updateOne: {
            filter: { _id: item.product },
            update: { $inc: { stock: item.quantity } }
        }
    }));
    if (bulkOps.length > 0) await Product.bulkWrite(bulkOps);
}

export const OrderCreator = async (req, res) => {
    try {
        const { paymentMethod } = req.body;
        const { user, processedItems, totalAmount, totalItems, shippingAddress, guestInfo, deliverytime } =
            await prepareOrder(req);

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

        if (user) {
            await saveShippingAddress(user, shippingAddress);
        }

        await order.populate("items.product");

        return res.status(201).json({
            success: true,
            message: user ? "Order Created Successfully!" : "Guest Order Created Successfully!",
            order
        });
    } catch (error) {
        if (error instanceof OrderValidationError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Step 1 of the PayPal flow: validate the cart, reserve stock, create a
// "pending" Order, then open a matching order on PayPal's side so the
// frontend's PayPal buttons have something to approve.
export const initiatePaypalOrder = async (req, res) => {
    try {
        const { user, processedItems, totalAmount, totalItems, shippingAddress, guestInfo, deliverytime } =
            await prepareOrder(req);

        const orderData = {
            items: processedItems,
            totalAmount,
            totalItems,
            shippingAddress,
            paymentMethod: "PayPal",
            paymentStatus: "pending",
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

        let paypalOrder;
        try {
            paypalOrder = await createPaypalOrder(totalAmount);
        } catch (paypalError) {
            // PayPal rejected the order — release the stock we just reserved.
            await restoreStock(processedItems);
            await Order.findByIdAndDelete(order._id);
            throw paypalError;
        }

        order.paymentDetails.paypalOrderId = paypalOrder.id;
        await order.save();

        if (user) {
            await saveShippingAddress(user, shippingAddress);
        }

        return res.status(201).json({
            success: true,
            message: "PayPal Order Created Successfully!",
            orderId: order._id,
            paypalOrderId: paypalOrder.id
        });
    } catch (error) {
        if (error instanceof OrderValidationError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Step 2 of the PayPal flow: called after the buyer approves the payment on
// PayPal's side. Captures the funds and only then marks the order paid.
export const confirmPaypalOrder = async (req, res) => {
    try {
        const { paypalOrderId } = req.params;

        const order = await Order.findOne({ "paymentDetails.paypalOrderId": paypalOrderId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order Not Found!" });
        }
        if (order.paymentStatus === "paid") {
            return res.status(200).json({ success: true, message: "Order Already Paid!", order });
        }

        const capture = await capturePaypalOrder(paypalOrderId);
        const captureResult = capture?.purchase_units?.[0]?.payments?.captures?.[0];

        if (capture.status !== "COMPLETED" || !captureResult) {
            order.paymentStatus = "failed";
            order.status = "cancelled";
            await order.save();
            await restoreStock(order.items);
            return res.status(402).json({ success: false, message: "Payment was not completed.", order });
        }

        order.paymentStatus = "paid";
        order.status = "confirmed";
        order.paymentDetails.paypalCaptureId = captureResult.id;
        await order.save();
        await order.populate("items.product");

        return res.status(200).json({ success: true, message: "Payment Captured Successfully!", order });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Charges a card via Authorize.Net using the opaque data (payment nonce)
// Accept.js produced in the browser, then creates the order only if the
// charge is actually approved. The raw card number never reaches this server.
export const chargeAuthorizeNetOrder = async (req, res) => {
    try {
        const { opaqueData } = req.body;
        if (!opaqueData?.dataDescriptor || !opaqueData?.dataValue) {
            return res.status(400).json({ success: false, message: "Missing card payment token (opaqueData)." });
        }

        const { user, processedItems, totalAmount, totalItems, shippingAddress, guestInfo, deliverytime } =
            await prepareOrder(req);

        const orderData = {
            items: processedItems,
            totalAmount,
            totalItems,
            shippingAddress,
            paymentMethod: "Authorize.Net",
            paymentStatus: "pending",
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

        let result;
        try {
            result = await chargeCreditCard({
                amount: totalAmount,
                opaqueData,
                invoiceNumber: order._id.toString().slice(-20),
                description: `Order ${order._id}`
            });
        } catch (gatewayError) {
            await restoreStock(processedItems);
            await Order.findByIdAndDelete(order._id);
            throw gatewayError;
        }

        const txn = result?.transactionResponse;
        const approved = result?.messages?.resultCode === "Ok" && txn?.responseCode === "1" && txn?.transId;

        if (!approved) {
            order.paymentStatus = "failed";
            order.status = "cancelled";
            await order.save();
            await restoreStock(processedItems);

            const reason =
                txn?.errors?.[0]?.errorText ||
                result?.messages?.message?.[0]?.text ||
                "Payment was declined.";

            return res.status(402).json({ success: false, message: reason, order });
        }

        order.paymentStatus = "paid";
        order.status = "confirmed";
        order.paymentDetails.authorizeNetTransactionId = txn.transId;
        await order.save();

        if (user) {
            await saveShippingAddress(user, shippingAddress);
        }

        await order.populate("items.product");

        return res.status(201).json({ success: true, message: "Payment Charged Successfully!", order });
    } catch (error) {
        if (error instanceof OrderValidationError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Receives async Authorize.Net webhook events (refunds, holds, disputes).
// Requires express's raw body (see index.js) to verify the signature.
export const authorizeNetWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-anet-signature"];
        const isValid = verifyWebhookSignature(req.rawBody, signature);
        if (!isValid) {
            return res.status(401).json({ success: false, message: "Invalid webhook signature." });
        }

        const { eventType, payload } = req.body;
        console.log("Authorize.Net webhook received:", eventType, payload?.id);

        // Extend here as needed, e.g. mark an order refunded/disputed by
        // looking it up via paymentDetails.authorizeNetTransactionId.

        return res.status(200).json({ success: true });
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
