import express from "express"
import {
    createAddress,
    getMyAddresses,
    getAddressById,
    updateAddress,
    deleteAddress
} from "../Controllers/AddressController.js"
import { protection } from "../Middleware/Middleware.js"

const addressRoutes = express.Router()

/**
 * @swagger
 * /Address:
 *   post:
 *     summary: Add a new address for the logged-in user
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - street
 *               - city
 *               - province
 *               - country
 *             properties:
 *               street:
 *                 type: string
 *                 example: 12 Main Street
 *               city:
 *                 type: string
 *                 example: Lahore
 *               province:
 *                 type: string
 *                 example: Punjab
 *               postalCode:
 *                 type: string
 *                 example: "54000"
 *               country:
 *                 type: string
 *                 example: Pakistan
 *     responses:
 *       201:
 *         description: Address created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or access token expired
 */
addressRoutes.post('/', protection, createAddress)

/**
 * @swagger
 * /Address:
 *   get:
 *     summary: Get all saved addresses for the logged-in user
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 */
addressRoutes.get('/', protection, getMyAddresses)

/**
 * @swagger
 * /Address/{id}:
 *   get:
 *     summary: Get one of the logged-in user's addresses by id
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Address fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       404:
 *         description: Address not found
 */
addressRoutes.get('/:id', protection, getAddressById)

/**
 * @swagger
 * /Address/{id}:
 *   put:
 *     summary: Update one of the logged-in user's addresses
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - street
 *               - city
 *               - province
 *               - country
 *             properties:
 *               street:
 *                 type: string
 *               city:
 *                 type: string
 *               province:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               country:
 *                 type: string
 *     responses:
 *       200:
 *         description: Address updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or access token expired
 *       404:
 *         description: Address not found
 */
addressRoutes.put('/:id', protection, updateAddress)

/**
 * @swagger
 * /Address/{id}:
 *   delete:
 *     summary: Delete one of the logged-in user's addresses
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       404:
 *         description: Address not found
 */
addressRoutes.delete('/:id', protection, deleteAddress)

export default addressRoutes
