import express from "express"
import { FindProductById, getAllProducts, getCategorySummary, imageDeletor, ProductCreator, ProductDeleter, ProductUpdater } from "../Controllers/productController.js"
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
 *               site:
 *                 type: string
 *                 enum: [doubleapple, triplebuzz, both]
 *                 description: Which storefront(s) this product should appear on (defaults to "both")
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
 *     summary: Get all products (paginated)
 *     description: >
 *       Returns a paginated list of products. Supports filtering by category
 *       and searching by name. All parameters are optional — defaults to page 1,
 *       limit 10, no filter.
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
 *         description: Number of products per page (max 100)
 *         example: 10
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum:
 *             - electronics
 *             - clothing
 *             - food
 *             - books
 *         required: false
 *         description: Filter products by category
 *         example: electronics
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: Search products by name
 *         example: iPhone
 *       - in: query
 *         name: site
 *         schema:
 *           type: string
 *           enum: [doubleapple, triplebuzz]
 *         required: false
 *         description: Filter to products targeting one storefront (products marked "both" always match)
 *     responses:
 *       200:
 *         description: Products fetched successfully
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
 *                   example: Products fetched!
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 totalPages:
 *                   type: integer
 *                   example: 5
 *                 totalItems:
 *                   type: integer
 *                   example: 48
 *                 itemsPerPage:
 *                   type: integer
 *                   example: 10
 *                 fromCache:
 *                   type: boolean
 *                   example: false
 *                   description: true if response was served from cache
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 64f1c2a1b2c3d4e5f6789012
 *                       name:
 *                         type: string
 *                         example: iPhone 15 Pro
 *                       description:
 *                         type: string
 *                         example: Latest Apple flagship smartphone
 *                       price:
 *                         type: number
 *                         example: 1200
 *                       stock:
 *                         type: number
 *                         example: 50
 *                       category:
 *                         type: string
 *                         example: electronics
 *                       brand:
 *                         type: string
 *                         example: Apple
 *                       site:
 *                         type: string
 *                         enum: [doubleapple, triplebuzz, both]
 *                         example: both
 *                       image:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             url:
 *                               type: string
 *                               example: https://res.cloudinary.com/demo/image/upload/sample.jpg
 *                             public_id:
 *                               type: string
 *                               example: product_images/sample
 *                       discount:
 *                         type: object
 *                         properties:
 *                           isActive:
 *                             type: boolean
 *                             example: true
 *                           discountType:
 *                             type: string
 *                             enum: [percentage, fixed]
 *                             example: percentage
 *                           value:
 *                             type: number
 *                             example: 20
 *                           startDate:
 *                             type: string
 *                             format: date
 *                             example: 2026-08-01
 *                           endDate:
 *                             type: string
 *                             format: date
 *                             example: 2026-08-31
 *                       discountActive:
 *                         type: boolean
 *                         example: true
 *                         description: >
 *                           Computed at read time — true only if discount.isActive is true
 *                           AND today falls within startDate/endDate. Use this instead of
 *                           discount.isActive to decide whether to show a "% off" badge,
 *                           since isActive alone doesn't account for expired or not-yet-started discounts.
 *                       finalPrice:
 *                         type: number
 *                         example: 960
 *                         description: price with the active discount applied (equals price when discountActive is false)
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2026-07-01T10:30:00.000Z
 *       400:
 *         description: Invalid query parameters
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
 *                   example: Invalid query parameters
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
productRoutes.get("/allproducts", getAllProducts)

/**
 * @swagger
 * /Product/categories:
 *   get:
 *     tags:
 *       - Products
 *     summary: Category list with product counts and a representative photo
 *     parameters:
 *       - in: query
 *         name: site
 *         schema:
 *           type: string
 *           enum: [doubleapple, triplebuzz]
 *     responses:
 *       200:
 *         description: Categories fetched successfully
 */
productRoutes.get("/categories", getCategorySummary)

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
 *               site:
 *                 type: string
 *                 enum: [doubleapple, triplebuzz, both]
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
 *     description: >
 *       Response includes computed discountActive (true only if the discount is
 *       currently within its date range, not just toggled on) and finalPrice
 *       (price with any active discount applied) alongside the raw product fields.
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
 *                     endDateInPast:
 *                       value: End date must be in the future.
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