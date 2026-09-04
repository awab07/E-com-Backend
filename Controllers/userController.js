import { User } from "../Model/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { OTP_gen } from "../utils/OTP_Generator.js";
import { sendOTPEmail } from "../Mailer/MailSender.js";
import { generateAccessToken, generateRefreshToken } from "../utils/Tokenization.js";

const safeUserFields = "_id firstname lastname email phno address role isverified isActive gender createdAt";

export const registerUser = async (req, res) => {
    try {
        const { firstname, lastname, email, password, phno, gender } = req.body;

        // Validations
        if (!firstname || !email || !password || !phno)
            return res.status(400).json({ message: "Please fill all required fields!" });
        if (!firstname.match(/^[a-zA-Z\s]+$/))
            return res.status(400).json({ message: "Invalid Firstname!" });
        if (lastname && !lastname.match(/^[a-zA-Z\s]+$/))
            return res.status(400).json({ message: "Invalid Lastname!" });
        if (!phno.match(/^\+?\d{10,15}$/))
            return res.status(400).json({ message: "Invalid Phone Number!" });
        if (password.length < 6)
            return res.status(400).json({ message: "Password must be 6 characters long!" });
        if (!password.match(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/))
            return res.status(400).json({ message: "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character!" });
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
            return res.status(400).json({ message: "Invalid Email!" });
        if (gender && !["male", "female", "other"].includes(gender))
            return res.status(400).json({ message: "Invalid Gender!" });

        const otp = OTP_gen();

        const [userExists, phoneExists, hashedPassword, hashedOtp] = await Promise.all([
            User.findOne({ email }).lean(),
            User.findOne({ phno }).lean(),
            bcrypt.hash(password, 10),
            bcrypt.hash(otp, 10)
        ]);

        if (phoneExists) return res.status(400).json({ message: "User with that Phone Number Already in Database!" });
        if (userExists) return res.status(400).json({ message: "User Already in Database!" });

        
        const [user] = await Promise.all([
            User.create({
                email,
                firstname,
                lastname,
                gender,
                password: hashedPassword,
                phno,
                otp: hashedOtp,
                otp_expiry: Date.now() + 5 * 60 * 1000
            }),
            sendOTPEmail(email, otp)
        ]);

        return res.status(201).json({
            success: true,
            message: "User Registered Successfully! Please check your email for OTP verification.",
            user: {
                _id: user._id,
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email,
                phno: user.phno
            }
        });

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const Loginuser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select("+password");
        if (!user) return res.status(400).json({ message: "User not found please register first!" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: "Invalid Credentials!" });

        if (!user.isverified) return res.status(401).json({ message: "Please verify Your email first!", verified: false, email: user.email });
        if (!user.isActive) return res.status(403).json({ message: "Your account is not active.", active: false });

        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const [accessToken, refreshToken] = await Promise.all([
            generateAccessToken(user),
            generateRefreshToken(user)
        ]);

        await User.updateOne(
            { _id: user._id },
            { refreshToken, refreshTokenExpiry }
        );

        // sameSite must be "none" (with secure: true) for the cookie to be sent at all
        // on cross-site requests — the frontend and backend are on different domains.
        // "strict"/"lax" only work when frontend and backend share the same site.
        // NODE_ENV isn't reliably "production" on Vercel's serverless runtime, so also
        // check VERCEL, which Vercel always sets at runtime for every deployment.
        const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            success: true,
            message: "User Logged in Successfully!",
            accessToken,
            user: {
                _id: user._id,
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email,
                phno: user.phno,
                gender: user.gender,
                address: user.address,
                role: user.role,
                isverified: user.isverified,
                isActive: user.isActive
            }
        });

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const refreshToken = async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;
        if (!token) return res.status(401).json({ success: false, message: "No refresh token provided." });

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        } catch (error) {
            if (error.name === "TokenExpiredError") {
                const expiredDecoded = jwt.decode(token);
                if (expiredDecoded?.id) {
                    await User.findByIdAndUpdate(expiredDecoded.id, {
                        refreshToken: null,
                        refreshTokenExpiry: null
                    });
                }
                return res.status(403).json({ success: false, message: "Refresh token expired. Please login again." });
            }
            return res.status(403).json({ success: false, message: "Invalid refresh token." });
        }

        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        if (user.refreshToken !== token) return res.status(403).json({ success: false, message: "Refresh token mismatch. Please login again." });
        if (user.refreshTokenExpiry && user.refreshTokenExpiry < new Date()) {
            await User.findByIdAndUpdate(user._id, { refreshToken: null, refreshTokenExpiry: null });
            return res.status(403).json({ success: false, message: "Refresh token expired. Please login again." });
        }

        const newAccessToken = generateAccessToken(user);
        return res.status(200).json({ success: true, accessToken: newAccessToken });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const logout = async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;
        if (token) {
            await User.findOneAndUpdate(
                { refreshToken: token },
                { refreshToken: null, refreshTokenExpiry: null }
            );
        }
        const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
        });
        return res.status(200).json({ success: true, message: "Logged out successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const UpdateUser = async (req, res) => {
    try {
        const userID = req.user.id;

        const { firstname, lastname, password, phno, gender, street, city, province, postalCode, country } = req.body;

        const updateFields = {};

        if (firstname?.trim()) updateFields.firstname = firstname.trim();
        if (lastname?.trim()) updateFields.lastname = lastname.trim();
        if (phno?.trim()) updateFields.phno = phno.trim();

        if (gender) {
            if (!["male", "female", "other"].includes(gender))
                return res.status(400).json({ success: false, message: "Invalid Gender!" });
            updateFields.gender = gender;
        }

        if (password && password.trim() !== "") {
            if (password.length < 6)
                return res.status(400).json({ success: false, message: "Password must be at least 6 characters long!" });
            updateFields.password = await bcrypt.hash(password, 10);
        }

        if (street || city || province || postalCode || country) {
            
            const existing = await User.findById(userID).select("address").lean();
            updateFields.address = {
                street:     street      ?? existing.address?.street      ?? "",
                city:       city        ?? existing.address?.city        ?? "",
                province:   province    ?? existing.address?.province    ?? "",
                postalCode: postalCode  ?? existing.address?.postalCode  ?? "",
                country:    country     ?? existing.address?.country     ?? "",
            };
        }

        const user = await User.findByIdAndUpdate(
            userID,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select("_id firstname lastname email phno gender address role").lean();

        if (!user) return res.status(404).json({ success: false, message: "User Not Found!" });

        return res.status(200).json({
            success: true,
            message: "Profile Updated Successfully!",
            user
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getuserbyid = async (req, res) => {
    try {

        const user = await User.findById(req.user.id).select(safeUserFields).lean();
        if (!user) return res.status(404).json({ success: false, message: "User Not Found!" });
        return res.status(200).json({ success: true, message: "User Fetched Successfully!", user });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const existingmail = await User.findOne({ email });
        if (!existingmail) return res.status(404).json({ success: false, message: "User Not Found Please Register first then verify!" });
        if (!otp) return res.status(400).json({ success: false, message: "Please Enter your OTP For verification" });
        if (!existingmail.otp) return res.status(400).json({ success: false, message: "OTP Not Found" });
        if (existingmail.otp_expiry < Date.now()) return res.status(400).json({ success: false, message: "OTP Expired!" });

        
        const isOtpValid = await bcrypt.compare(otp, existingmail.otp);
        if (!isOtpValid) return res.status(400).json({ success: false, message: "Invalid OTP" });

        await User.findOneAndUpdate(
            { email },
            { isverified: true, isActive: true, otp: null, otp_expiry: null }
        );

        return res.status(200).json({ success: true, message: "User Verified Successfully!" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const reverify = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email is required." });

        const existed_user = await User.findOne({ email });
        if (!existed_user) return res.status(404).json({ success: false, message: "User not found." });
        if (existed_user.isverified) return res.status(400).json({ success: false, message: "User is already verified." });

        const otp = OTP_gen();
        
        const hashedOtp = await bcrypt.hash(otp, 10);
        existed_user.otp = hashedOtp;
        existed_user.otp_expiry = Date.now() + 5 * 60 * 1000;

        await Promise.all([
            existed_user.save(),
            sendOTPEmail(existed_user.email, otp)
        ]);

        return res.status(200).json({ success: true, message: "New OTP sent successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const changeUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (![true, false].includes(status)) return res.status(400).json({ success: false, message: "Invalid Status!" });

        const user = await User.findByIdAndUpdate(
            id,
            { isActive: status },
            { new: true, select: safeUserFields }
        );
        if (!user) return res.status(404).json({ success: false, message: "User Not Found in the Database!" });

        return res.status(200).json({ success: true, message: "User Account Status Updated Successfully!", user });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getalluserforadmin = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const search = req.query.search || null;
        const skip = (page - 1) * limit;

        const filter = {};
        if (search) {
            filter.$text = { $search: search }; 
        }

        const [users, totalItems] = await Promise.all([
            User.find(filter)
                .select(safeUserFields)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        return res.status(200).json({
            success: true,
            message: "Users Fetched Successfully!",
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems,
            itemsPerPage: limit,
            users
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
