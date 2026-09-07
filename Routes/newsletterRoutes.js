import express from "express"
import { subscribeNewsletter, getAllSubscribers, deleteSubscriber } from "../Controllers/newsletterController.js"
import { protection, isAdmin } from "../Middleware/Middleware.js"

const newsletterRoutes = express.Router()

/**
 * @swagger
 * /Newsletter/subscribe:
 *   post:
 *     summary: Subscribe an email to the newsletter
 *     tags: [Newsletter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: customer@example.com
 *     responses:
 *       201:
 *         description: Subscribed successfully
 *       200:
 *         description: Email was already subscribed
 *       400:
 *         description: Invalid email
 */
newsletterRoutes.post('/subscribe', subscribeNewsletter)

/**
 * @swagger
 * /Newsletter/admin:
 *   get:
 *     summary: Get all newsletter subscribers, paginated (Admin only)
 *     tags: [Newsletter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Subscribers fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Admin access required
 */
newsletterRoutes.get('/admin', protection, isAdmin, getAllSubscribers)

/**
 * @swagger
 * /Newsletter/admin/{id}:
 *   delete:
 *     summary: Remove a newsletter subscriber (Admin only)
 *     tags: [Newsletter]
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
 *         description: Subscriber removed successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Subscriber not found
 */
newsletterRoutes.delete('/admin/:id', protection, isAdmin, deleteSubscriber)

export default newsletterRoutes
