import express from "express"
import { FindProductById, getAllProducts, imageDeletor, ProductCreator, ProductDeleter, ProductUpdater } from "../Controllers/productController.js"
import { isAdmin, protection } from "../Middleware/Middleware.js"
import { multiStorage } from "../Middleware/multer.js"
import { discountController } from "../Controllers/Discount-Controller.js"


const productRoutes = express.Router()

/**
 * @swagger
 * /Product/createProduct:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create a new product (Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - stock
 *               - category
 *             properties:
 *               name:
 *                 type: string
 *                 example: iPhone 15
 *               description:
 *                 type: string
 *                 example: Latest Apple smartphone
 *               price:
 *                 type: number
 *                 example: 1200
 *               stock:
 *                 type: number
 *                 example: 10
 *               category:
 *                 type: string
 *                 example: mobile
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden (not admin)
 */
productRoutes.post('/createProduct', multiStorage, protection, isAdmin, ProductCreator)

/**
 * @swagger
 * /Product/allproducts:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get all products
 *     responses:
 *       200:
 *         description: Products fetched successfully
 */
productRoutes.get("/allproducts", getAllProducts)

/**
 * @swagger
 * /Product/{id}:
 *   put:
 *     tags:
 *       - Products
 *     summary: Update product (Admin only)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: number
 *               category:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden (not admin)
 *       404:
 *         description: Product not found
 */
productRoutes.put("/:id", protection, isAdmin, multiStorage, ProductUpdater)

/**
 * @swagger
 * /Product/{id}:
 *   delete:
 *     tags:
 *       - Products
 *     summary: Delete product (Admin only)
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
 *         description: Product deleted successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden (not admin)
 *       404:
 *         description: Product not found
 */
productRoutes.delete("/:id", protection, isAdmin, ProductDeleter)

/**
 * @swagger
 * /Product/{id}:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product fetched successfully
 *       404:
 *         description: Product not found
 */
productRoutes.get("/:id", FindProductById)

/**
 * @swagger
 * /Product/{id}/image:
 *   delete:
 *     tags:
 *       - Products
 *     summary: Delete a single product image (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Image deleted successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden (not admin)
 *       404:
 *         description: Product or image not found
 */
productRoutes.delete("/:id/image", protection, isAdmin, imageDeletor)

/**
 * @swagger
 * /Product/{id}/discount:
 *   put:
 *     summary: Add or update a product discount (Admin only)
 *     description: Allows an admin to create or update a discount for a specific product.
 *     tags:
 *       - Discount
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Product ID
 *         schema:
 *           type: string
 *           example: 689f4d5e6c8b3a0012abcd34
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *               - discountType
 *               - value
 *               - startDate
 *               - endDate
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 example: true
 *               discountType:
 *                 type: string
 *                 enum:
 *                   - percentage
 *                   - fixed
 *                 example: percentage
 *               value:
 *                 type: number
 *                 example: 20
 *                 description: Percentage (1-100) or fixed discount amount
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: 2026-07-25
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: 2026-07-31
 *     responses:
 *       200:
 *         description: Discount added successfully
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
 *                   example: Discount Added to product!
 *       400:
 *         description: Validation error
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
 *                   examples:
 *                     missingFields:
 *                       value: Please Fill All the Fields!
 *                     invalidType:
 *                       value: Invalid Discount Type or Discount Type is Not Supported!
 *                     invalidPercentage:
 *                       value: Percentile must be between 1 and 100
 *                     invalidFixed:
 *                       value: Fixed must be less than the actual product price!
 *                     invalidDate:
 *                       value: End date must be after start date.
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden — Admin access required
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal Server Error
 */
productRoutes.put('/:id/discount', protection, isAdmin, discountController)

export default productRoutes;