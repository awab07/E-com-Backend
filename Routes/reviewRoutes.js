import express from "express"
import { getProductReviews, writeReview, deleteReview, getMyReviews } from "../Controllers/reviewController.js"
import { protection } from "../Middleware/Middleware.js"

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
 * /Review/{productId}:
 *   get:
 *     summary: Get all reviews for a product, plus a rating summary
 *     tags: [Reviews]
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
reviewRoutes.get('/:productId', getProductReviews)

/**
 * @swagger
 * /Review/{productId}:
 *   post:
 *     summary: Write or update the logged-in user's review for a product
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
 *     responses:
 *       200:
 *         description: Review saved successfully
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
