import express from "express"
import {
    createCoupon,
    getAllCoupons,
    updateCoupon,
    deleteCoupon,
    validateCoupon,
    getRibbonCoupon
} from "../Controllers/couponController.js"
import { protection, isAdmin } from "../Middleware/Middleware.js"

const couponRoutes = express.Router()

/**
 * @swagger
 * /Coupon:
 *   post:
 *     summary: Create a new coupon (Admin only)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - value
 *               - startDate
 *               - endDate
 *             properties:
 *               code:
 *                 type: string
 *                 example: SAVE10
 *               discountType:
 *                 type: string
 *                 enum: [percentage, fixed]
 *                 example: percentage
 *               value:
 *                 type: number
 *                 example: 10
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               minOrderAmount:
 *                 type: number
 *               site:
 *                 type: string
 *                 enum: [doubleapple, triplebuzz, both]
 *               showOnRibbon:
 *                 type: boolean
 *               ribbonText:
 *                 type: string
 *     responses:
 *       201:
 *         description: Coupon created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Coupon code already exists
 */
couponRoutes.post('/', protection, isAdmin, createCoupon)

/**
 * @swagger
 * /Coupon/admin:
 *   get:
 *     summary: Get all coupons (Admin only)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Coupons fetched successfully
 */
couponRoutes.get('/admin', protection, isAdmin, getAllCoupons)

/**
 * @swagger
 * /Coupon/validate:
 *   post:
 *     summary: Validate a coupon code and preview its discount
 *     tags: [Coupons]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *               cartTotal:
 *                 type: number
 *               site:
 *                 type: string
 *                 enum: [doubleapple, triplebuzz]
 *     responses:
 *       200:
 *         description: Coupon is valid, discount returned
 *       400:
 *         description: Coupon not active/expired/below minimum order
 *       404:
 *         description: Coupon not found
 */
couponRoutes.post('/validate', validateCoupon)

/**
 * @swagger
 * /Coupon/ribbon:
 *   get:
 *     summary: Get the coupon (if any) currently featured on the announcement ribbon
 *     tags: [Coupons]
 *     parameters:
 *       - in: query
 *         name: site
 *         schema:
 *           type: string
 *           enum: [doubleapple, triplebuzz]
 *     responses:
 *       200:
 *         description: Returns the live ribbon coupon, or null if none is featured
 */
couponRoutes.get('/ribbon', getRibbonCoupon)

/**
 * @swagger
 * /Coupon/{id}:
 *   put:
 *     summary: Update a coupon (Admin only)
 *     tags: [Coupons]
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
 *         description: Coupon updated successfully
 *       404:
 *         description: Coupon not found
 */
couponRoutes.put('/:id', protection, isAdmin, updateCoupon)

/**
 * @swagger
 * /Coupon/{id}:
 *   delete:
 *     summary: Delete a coupon (Admin only)
 *     tags: [Coupons]
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
 *         description: Coupon deleted successfully
 *       404:
 *         description: Coupon not found
 */
couponRoutes.delete('/:id', protection, isAdmin, deleteCoupon)

export default couponRoutes
