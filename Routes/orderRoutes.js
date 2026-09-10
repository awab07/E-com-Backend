import express from "express"
import { getAllOrderForAdmin, getArchiedOrders, getOrderById, getOrders, getStatsStore, ordercancelforuser, OrderCreator, orderdeletionforAdmin, UpdateOrderStatus, initiatePaypalOrder, confirmPaypalOrder, chargeAuthorizeNetOrder, authorizeNetWebhook } from "../Controllers/OrderController.js"
import { GuestProtection, isAdmin, isUser, protection } from "../Middleware/Middleware.js"
import { Admin } from "mongodb"
const orderrouter = express.Router()
/**
 * @swagger
 * /Order/create:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Create a new order (User only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - shippingAddress
 *             properties:
 *               items:
 *                 type: array
 *                 example:
 *                   - productId: "64f1c2a1b2c3d4e5f6789012"
 *                     quantity: 2
 *               shippingAddress:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   province:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   country:
 *                     type: string
 *               paymentMethod:
 *                 type: string
 *                 example: "Cash On Delivery"
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Product not found
 */
orderrouter.post("/create", GuestProtection, OrderCreator)

/**
 * @swagger
 * /Order/paypal/create:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Validate cart, reserve stock, and open a matching PayPal order
 *     description: >
 *       Creates a "pending" Order in the database and a matching PayPal order.
 *       Returns paypalOrderId for the frontend PayPal buttons to approve.
 *       Call /Order/paypal/capture/{paypalOrderId} after buyer approval.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - shippingAddress
 *             properties:
 *               items:
 *                 type: array
 *                 example:
 *                   - productId: "64f1c2a1b2c3d4e5f6789012"
 *                     quantity: 2
 *               shippingAddress:
 *                 type: object
 *     responses:
 *       201:
 *         description: PayPal order created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Product not found
 */
orderrouter.post("/paypal/create", GuestProtection, initiatePaypalOrder)

/**
 * @swagger
 * /Order/paypal/capture/{paypalOrderId}:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Capture a PayPal payment after buyer approval
 *     parameters:
 *       - in: path
 *         name: paypalOrderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment captured, order marked paid
 *       402:
 *         description: Payment was not completed
 *       404:
 *         description: Order not found
 */
orderrouter.post("/paypal/capture/:paypalOrderId", confirmPaypalOrder)

/**
 * @swagger
 * /Order/authorizenet/charge:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Charge a card via Authorize.Net (Accept.js opaque data) and create the order
 *     description: >
 *       The frontend must first tokenize the card with Authorize.Net's Accept.js
 *       and send the resulting opaqueData ({dataDescriptor, dataValue}) here.
 *       Raw card numbers should never be sent to this endpoint.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - shippingAddress
 *               - opaqueData
 *             properties:
 *               items:
 *                 type: array
 *                 example:
 *                   - productId: "64f1c2a1b2c3d4e5f6789012"
 *                     quantity: 2
 *               shippingAddress:
 *                 type: object
 *               opaqueData:
 *                 type: object
 *                 properties:
 *                   dataDescriptor:
 *                     type: string
 *                   dataValue:
 *                     type: string
 *     responses:
 *       201:
 *         description: Payment charged and order created
 *       400:
 *         description: Validation error
 *       402:
 *         description: Payment declined
 *       404:
 *         description: Product not found
 */
orderrouter.post("/authorizenet/charge", GuestProtection, chargeAuthorizeNetOrder)

/**
 * @swagger
 * /Order/authorizenet/webhook:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Authorize.Net webhook receiver (signature-verified)
 *     responses:
 *       200:
 *         description: Event accepted
 *       401:
 *         description: Invalid signature
 */
orderrouter.post("/authorizenet/webhook", authorizeNetWebhook)
/**
 * @swagger
 * /Order:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get logged-in user orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *       401:
 *         description: Unauthorized
 */
orderrouter.get("/", protection, getOrders)
/**
 * @swagger
 * /Order/admin:
 *   get:
 *     tags:
 *       - Orders (Admin)
 *     summary: Get all orders (Admin only, paginated)
 *     description: >
 *       Returns a paginated list of all non-archived orders.
 *       Supports filtering by order status. Requires Admin bearer token.
 *       Results sorted by newest first.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         required: false
 *         description: Page number to fetch
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         required: false
 *         description: Number of orders per page (max 100)
 *         example: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum:
 *             - pending
 *             - confirmed
 *             - shipped
 *             - delivered
 *             - cancelled
 *         required: false
 *         description: Filter orders by status
 *         example: pending
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Orders Fetched Successfully!
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 totalPages:
 *                   type: integer
 *                   example: 8
 *                 totalItems:
 *                   type: integer
 *                   example: 78
 *                 itemsPerPage:
 *                   type: integer
 *                   example: 10
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 64f1c2a1b2c3d4e5f6789012
 *                       status:
 *                         type: string
 *                         enum: [pending, confirmed, shipped, delivered, cancelled]
 *                         example: pending
 *                       totalAmount:
 *                         type: number
 *                         example: 2400
 *                       totalItems:
 *                         type: integer
 *                         example: 2
 *                       paymentMethod:
 *                         type: string
 *                         enum: [Cash On Delivery, Stripe, JazzCash, EasyPaisa]
 *                         example: Cash On Delivery
 *                       paymentStatus:
 *                         type: string
 *                         enum: [pending, paid, failed]
 *                         example: pending
 *                       isGuestOrder:
 *                         type: boolean
 *                         example: false
 *                       estimatedDelivery:
 *                         type: string
 *                         format: date-time
 *                         example: 2026-09-01T00:00:00.000Z
 *                       deliveredAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: null
 *                       shippingAddress:
 *                         type: object
 *                         properties:
 *                           street:
 *                             type: string
 *                             example: 12 Main Street
 *                           city:
 *                             type: string
 *                             example: Lahore
 *                           province:
 *                             type: string
 *                             example: Punjab
 *                           postalCode:
 *                             type: string
 *                             example: "54000"
 *                           country:
 *                             type: string
 *                             example: Pakistan
 *                       user:
 *                         type: object
 *                         nullable: true
 *                         description: null if guest order
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 64f1c2a1b2c3d4e5f6789099
 *                           firstname:
 *                             type: string
 *                             example: Ali
 *                           lastname:
 *                             type: string
 *                             example: Hassan
 *                           email:
 *                             type: string
 *                             example: ali@example.com
 *                           phno:
 *                             type: string
 *                             example: "+923001234567"
 *                       guestInfo:
 *                         type: object
 *                         nullable: true
 *                         description: null if registered user order
 *                         properties:
 *                           firstName:
 *                             type: string
 *                             example: Sara
 *                           lastName:
 *                             type: string
 *                             example: Khan
 *                           email:
 *                             type: string
 *                             example: sara@example.com
 *                           phone:
 *                             type: string
 *                             example: "+923009876543"
 *                       items:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             quantity:
 *                               type: integer
 *                               example: 2
 *                             price:
 *                               type: number
 *                               example: 1200
 *                             product:
 *                               type: object
 *                               properties:
 *                                 _id:
 *                                   type: string
 *                                   example: 64f1c2a1b2c3d4e5f6789013
 *                                 name:
 *                                   type: string
 *                                   example: iPhone 15 Pro
 *                                 price:
 *                                   type: number
 *                                   example: 1200
 *                                 category:
 *                                   type: string
 *                                   example: electronics
 *                                 image:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       url:
 *                                         type: string
 *                                         example: https://res.cloudinary.com/demo/image/upload/sample.jpg
 *                                       public_id:
 *                                         type: string
 *                                         example: product_images/sample
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2026-08-28T10:30:00.000Z
 *       401:
 *         description: Unauthorized — token missing or expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Access token expired. Please refresh.
 *                 expired:
 *                   type: boolean
 *                   example: true
 *       403:
 *         description: Forbidden — Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Access Denied: Admins only!"
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal Server Error
 */
orderrouter.get("/admin", protection, getAllOrderForAdmin)
/**
 * @swagger
 * /Order/{id}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order fetched successfully
 *       404:
 *         description: Order not found
 */
orderrouter.get("/:id", protection, getOrderById)
/**
 * @swagger
 * /Order/admin/orders/{id}/status:
 *   put:
 *     tags:
 *       - Orders (Admin)
 *     summary: Update order status (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 example: "shipped"
 *                 enum:
 *                   - pending
 *                   - confirmed
 *                   - shipped
 *                   - delivered
 *                   - cancelled
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status or transition
 *       404:
 *         description: Order not found
 */
orderrouter.put("/admin/orders/:id/status", protection, isAdmin, UpdateOrderStatus)
/**
 * @swagger
 * /Order/{id}:
 *   put:
 *     tags:
 *       - Orders
 *     summary: Cancel order (User only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Order cannot be cancelled
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
orderrouter.put("/:id", protection, isUser, ordercancelforuser)
/**
 * @swagger
 * /Order/admin/orders/{id}:
 *   delete:
 *     tags:
 *       - Orders (Admin)
 *     summary: Delete order (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order deleted successfully
 *       404:
 *         description: Order not found
 */
orderrouter.delete("/admin/orders/:id", protection, isAdmin, orderdeletionforAdmin)
orderrouter.get("/admin/ArchevedOrders", protection, isAdmin, getArchiedOrders)
orderrouter.get("/Admin/Store", protection, isAdmin, getStatsStore)
export default orderrouter