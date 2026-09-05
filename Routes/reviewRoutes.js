import express from "express"
import {
    getProductReviews,
    writeReview,
    deleteReview,
    getMyReviews,
    getPendingReviews,
    updateReviewStatus
} from "../Controllers/reviewController.js"
import { protection, isAdmin, GuestProtection } from "../Middleware/Middleware.js"

const reviewRoutes = express.Router()

/**
 * @swagger
 * /Review/mine:
 *   get:
 *     summary: Get all reviews written by the logged-in user
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reviews fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 */
reviewRoutes.get('/mine', protection, getMyReviews)

/**
 * @swagger
 * /Review/admin/pending:
 *   get:
 *     summary: Get all reviews awaiting admin approval (Admin only)
 *     tags: [Reviews (Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: site
 *         schema:
 *           type: string
 *           enum: [doubleapple, triplebuzz]
 *         description: Filter to reviews submitted from one storefront
 *     responses:
 *       200:
 *         description: Pending reviews fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden (not admin)
 */
reviewRoutes.get('/admin/pending', protection, isAdmin, getPendingReviews)

/**
 * @swagger
 * /Review/admin/{id}/status:
 *   put:
 *     summary: Approve or reject a review (Admin only)
 *     tags: [Reviews (Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
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
 *                 enum: [pending, approved, rejected]
 *                 example: approved
 *     responses:
 *       200:
 *         description: Review status updated successfully
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden (not admin)
 *       404:
 *         description: Review not found
 */
reviewRoutes.put('/admin/:id/status', protection, isAdmin, updateReviewStatus)

/**
 * @swagger
 * /Review/{productId}:
 *   get:
 *     summary: Get all approved reviews for a product, plus a rating summary
 *     description: >
 *       Returns approved reviews visible to everyone. If the caller is logged in
 *       (bearer token, optional), their own review is also included regardless of
 *       its status — e.g. "pending" while it awaits admin approval.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [latest, rating]
 *     responses:
 *       200:
 *         description: Reviews fetched successfully
 */
reviewRoutes.get('/:productId', GuestProtection, getProductReviews)

/**
 * @swagger
 * /Review/{productId}:
 *   post:
 *     summary: Write or update the logged-in user's review for a product
 *     description: >
 *       The review is saved with status "pending" and is only shown publicly once
 *       an admin approves it. The submitting user can still see their own pending
 *       review when fetching the product's reviews.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 example: 5
 *               comment:
 *                 type: string
 *                 example: Great product, fast pickup.
 *               site:
 *                 type: string
 *                 enum: [doubleapple, triplebuzz]
 *                 description: Which storefront this review was submitted from
 *     responses:
 *       200:
 *         description: Review saved successfully, pending admin approval
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or access token expired
 *       404:
 *         description: Product not found
 */
reviewRoutes.post('/:productId', protection, writeReview)

/**
 * @swagger
 * /Review/{productId}:
 *   delete:
 *     summary: Delete the logged-in user's review for a product
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review deleted successfully
 *       401:
 *         description: Unauthorized or access token expired
 */
reviewRoutes.delete('/:productId', protection, deleteReview)

export default reviewRoutes
