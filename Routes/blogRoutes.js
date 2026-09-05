import express from "express"
import { createBlog, getAllBlogs, getBlogById, updateBlog, deleteBlog } from "../Controllers/blogController.js"
import { isAdmin, protection } from "../Middleware/Middleware.js"
import { singleStorage } from "../Middleware/multer.js"

const blogRoutes = express.Router()

/**
 * @swagger
 * /Blog:
 *   post:
 *     summary: Create a new blog post (Admin only)
 *     tags: [Blog]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               excerpt:
 *                 type: string
 *               category:
 *                 type: string
 *               site:
 *                 type: string
 *                 enum: [doubleapple, triplebuzz, both]
 *                 description: Which storefront(s) this post should appear on
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Blog created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Admin access required
 */
blogRoutes.post('/', protection, isAdmin, singleStorage, createBlog)

/**
 * @swagger
 * /Blog:
 *   get:
 *     summary: Get all blog posts (paginated)
 *     tags: [Blog]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: site
 *         schema:
 *           type: string
 *           enum: [doubleapple, triplebuzz]
 *         description: Filter to posts targeting one storefront (posts marked "both" always match)
 *     responses:
 *       200:
 *         description: Blogs fetched successfully
 */
blogRoutes.get('/', getAllBlogs)

/**
 * @swagger
 * /Blog/{id}:
 *   get:
 *     summary: Get a single blog post by id
 *     tags: [Blog]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Blog fetched successfully
 *       404:
 *         description: Blog not found
 */
blogRoutes.get('/:id', getBlogById)

/**
 * @swagger
 * /Blog/{id}:
 *   put:
 *     summary: Update a blog post (Admin only)
 *     tags: [Blog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               excerpt:
 *                 type: string
 *               category:
 *                 type: string
 *               site:
 *                 type: string
 *                 enum: [doubleapple, triplebuzz, both]
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Blog updated successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Blog not found
 */
blogRoutes.put('/:id', protection, isAdmin, singleStorage, updateBlog)

/**
 * @swagger
 * /Blog/{id}:
 *   delete:
 *     summary: Delete a blog post (Admin only)
 *     tags: [Blog]
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
 *         description: Blog deleted successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Blog not found
 */
blogRoutes.delete('/:id', protection, isAdmin, deleteBlog)

export default blogRoutes
