import express from "express"
import {
    changeUserStatus,
    getalluserforadmin,
    getuserbyid,
    Loginuser,
    registerUser,
    removeAvatar,
    reverify,
    UpdateUser,
    uploadAvatar,
    verifyOTP,
    refreshToken,
    logout
} from "../Controllers/userController.js";
import { isAdmin, protection, refreshTokenMiddleware } from "../Middleware/Middleware.js";
import { singleStorage } from "../Middleware/multer.js";

const userRoutes = express.Router()

/**
 * @swagger
 * /Api/register:
 *   post:
 *     summary: Register a new user
 *     tags: [User Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstname
 *               - email
 *               - password
 *               - phno
 *             properties:
 *               firstname:
 *                 type: string
 *                 example: John
 *               lastname:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 example: john@gmail.com
 *               password:
 *                 type: string
 *                 example: Password@123
 *               phno:
 *                 type: string
 *                 example: "+923001234567"
 *     responses:
 *       200:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or user already exists
 */
userRoutes.post("/register", registerUser)

/**
 * @swagger
 * /Api/login:
 *   post:
 *     summary: Login user
 *     tags: [User Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: john@gmail.com
 *               password:
 *                 type: string
 *                 example: Password@123
 *     responses:
 *       200:
 *         description: Login successful — returns accessToken in body, refreshToken as httpOnly cookie
 *       400:
 *         description: Invalid credentials
 *       401:
 *         description: Email not verified
 *       403:
 *         description: Account not active
 */
userRoutes.post("/login", Loginuser)

/**
 * @swagger
 * /Api/refresh-token:
 *   post:
 *     summary: Get a new access token using the refresh token cookie
 *     tags: [User Auth]
 *     description: >
 *       Call this endpoint when your access token expires (401 + expired: true).
 *       The refresh token is read automatically from the httpOnly cookie set at login.
 *       No request body needed.
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       401:
 *         description: No refresh token provided
 *       403:
 *         description: Invalid or expired refresh token — user must login again
 */
userRoutes.post("/refresh-token", refreshTokenMiddleware, refreshToken)

/**
 * @swagger
 * /Api/logout:
 *   post:
 *     summary: Logout user and invalidate refresh token
 *     tags: [User Auth]
 *     description: Clears the httpOnly refresh token cookie and removes it from the database.
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       500:
 *         description: Internal Server Error
 */
userRoutes.post("/logout", logout)

/**
 * @swagger
 * /Api/update:
 *   put:
 *     summary: Update logged-in user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstname:
 *                 type: string
 *                 example: John
 *               lastname:
 *                 type: string
 *                 example: Doe
 *               password:
 *                 type: string
 *                 example: NewPassword@123
 *               phno:
 *                 type: string
 *                 example: "+923001234567"
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
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or access token expired
 */
userRoutes.put("/update", protection, UpdateUser);

/**
 * @swagger
 * /Api/avatar:
 *   post:
 *     summary: Upload or replace the logged-in user's profile picture
 *     tags: [User Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile picture updated successfully
 *       400:
 *         description: No image file provided
 *       401:
 *         description: Unauthorized or access token expired
 */
userRoutes.post("/avatar", protection, singleStorage, uploadAvatar);

/**
 * @swagger
 * /Api/avatar:
 *   delete:
 *     summary: Remove the logged-in user's profile picture
 *     tags: [User Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile picture removed
 *       401:
 *         description: Unauthorized or access token expired
 *       404:
 *         description: User not found
 */
userRoutes.delete("/avatar", protection, removeAvatar);

/**
 * @swagger
 * /Api/admin-page:
 *   get:
 *     summary: Admin only route
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Welcome admin message
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Forbidden (not admin)
 */
userRoutes.get("/admin-page", protection, isAdmin, (req, res) => {
    try {
        return res.status(200).json({ success: true, message: `Welcome ${req.user.name} Admin!` })
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
})

/**
 * @swagger
 * /Api/user-page:
 *   get:
 *     summary: User dashboard route
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Welcome user message
 *       401:
 *         description: Unauthorized or access token expired
 */
userRoutes.get("/user-page", protection, (req, res) => {
    try {
        return res.status(200).json({ success: true, message: `Welcome ${req.user.name} User!` })
    } catch (error) {
        return res.status(500).json({ message: error.message })
    }
})

/**
 * @swagger
 * /Api/:
 *   get:
 *     summary: Get logged-in user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 */
userRoutes.get("/", protection, getuserbyid)

/**
 * @swagger
 * /Api/verify:
 *   post:
 *     summary: Verify user email using OTP
 *     tags: [User Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@gmail.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: User verified successfully
 *       400:
 *         description: Invalid OTP or OTP expired
 *       404:
 *         description: User not found or OTP not found
 *       500:
 *         description: Internal Server Error
 */
userRoutes.post("/verify", verifyOTP)

/**
 * @swagger
 * /Api/reverify:
 *   post:
 *     summary: Send a new OTP to unverified user
 *     tags: [User Auth]
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
 *                 example: user@gmail.com
 *     responses:
 *       200:
 *         description: New OTP sent successfully
 *       400:
 *         description: Email missing or user already verified
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal Server Error
 */
userRoutes.post("/reverify", reverify)

/**
 * @swagger
 * /Api/change-status/{id}:
 *   put:
 *     summary: Activate or deactivate a user account (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *           example: 66b2c3c0f5b7a2d18a8a1234
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
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: User account status updated successfully
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal Server Error
 */
userRoutes.put("/change-status/:id", protection, isAdmin, changeUserStatus)

/**
 * @swagger
 * /Api/getalluserforadmin:
 *   get:
 *     summary: Get all registered users (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users fetched successfully
 *       401:
 *         description: Unauthorized or access token expired
 *       403:
 *         description: Admin access required
 *       404:
 *         description: No users found
 *       500:
 *         description: Internal Server Error
 */
userRoutes.get("/getalluserforadmin", protection, isAdmin, getalluserforadmin)

export default userRoutes;