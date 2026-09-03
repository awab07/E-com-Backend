import express from "express"
import { getMyWishlist, addToWishlist, removeFromWishlist } from "../Controllers/wishlistController.js"
import { protection } from "../Middleware/Middleware.js"

const wishlistRoutes = express.Router()

/**
 * @swagger
 * /Wishlist:
 *   get:
 *     summary: Get the logged-in user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 */
wishlistRoutes.get('/', protection, getMyWishlist)

/**
 * @swagger
 * /Wishlist/{productId}:
 *   post:
 *     summary: Add a product to the logged-in user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Added to wishlist (or already present)
 *       401:
 *         description: Unauthorized or access token expired
 *       404:
 *         description: Product not found
 */
wishlistRoutes.post('/:productId', protection, addToWishlist)

/**
 * @swagger
 * /Wishlist/{productId}:
 *   delete:
 *     summary: Remove a product from the logged-in user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Removed from wishlist
 *       401:
 *         description: Unauthorized or access token expired
 */
wishlistRoutes.delete('/:productId', protection, removeFromWishlist)

export default wishlistRoutes
