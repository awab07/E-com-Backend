import fs from "fs";
import { User } from "../Model/userModel.js";
import jwt from "jsonwebtoken";

export const logger = (req, res, next) => {
    const log = `${new Date().toISOString()} | ${req.method} | ${req.url}\n`;
    fs.appendFile("ServerLog.txt", log, (err) => {
        if (err) console.error("Logger Error:", err);
    });
    next();
};

export const protection = async (req, res, next) => {
    try {
        const authheader = req.headers.authorization;
        if (!authheader || !authheader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const token = authheader.split(" ")[1];
        try {
            
            const decode = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            const user = await User.findById(decode.id);
            if (!user) {
                return res.status(400).json({ success: false, message: "User is not Registered!" });
            }
            req.user = decode;
            next();
        } catch (error) {
            if (error.name === "TokenExpiredError") {
                return res.status(401).json({
                    success: false,
                    message: "Access token expired. Please refresh.",
                    expired: true,
                });
            }
            return res.status(401).json({ success: false, message: "Token is missing or invalid!" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const refreshTokenMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies?.refreshToken;

        if (!token) {
            return res.status(401).json({ success: false, message: "No refresh token provided." });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        } catch (error) {
            if (error.name === "TokenExpiredError") {
                return res.status(403).json({
                    success: false,
                    message: "Refresh token expired. Please login again.",
                });
            }
            return res.status(403).json({ success: false, message: "Invalid refresh token." });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        
        if (user.refreshToken !== token) {
            return res.status(403).json({
                success: false,
                message: "Refresh token mismatch. Please login again.",
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const isAdmin = (req, res, next) => {
    try {
        if (req.user && req.user.role === "admin") {
            next();
        } else {
            return res.status(403).json({ success: false, message: "Access Denied: Admins only!" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const isUser = (req, res, next) => {
    try {
        if (req.user && req.user.role === "user") {
            next();
        } else {
            return res.status(403).json({ success: false, message: "Access Denied: This action is for users only!" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const GuestProtection = (req, res, next) => {
    try {
        const authheader = req.headers.authorization;
        if (!authheader || !authheader.startsWith("Bearer ")) {
            req.user = null;
            return next();
        }
        const token = authheader.split(" ")[1];
        try {
            req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        } catch (error) {
            // Optional auth: an expired/invalid token just means "browse as guest"
            // here, not a hard failure — the client will refresh it in the
            // background for routes that actually require a valid session.
            req.user = null;
        }
        return next();
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};