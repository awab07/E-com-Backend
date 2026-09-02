import { Address } from "../Model/AddressModel.js";

export const createAddress = async (req, res) => {
    try {
        const { street, city, province, postalCode, country } = req.body;

        if (!street || !city || !province || !country) {
            return res.status(400).json({
                success: false,
                message: "Please fill the required fields!"
            });
        }

        const address = await Address.create({
            user: req.user.id,
            street,
            city,
            province,
            postalCode,
            country
        });

        return res.status(201).json({
            success: true,
            message: "Address Created Successfully!",
            address
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getMyAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Addresses Fetched Successfully!",
            addresses
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getAddressById = async (req, res) => {
    try {
        const { id } = req.params;

        const address = await Address.findOne({ _id: id, user: req.user.id }).lean();
        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address Not Found!"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Address Fetched Successfully!",
            address
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { street, city, province, postalCode, country } = req.body;

        if (!street || !city || !province || !country) {
            return res.status(400).json({
                success: false,
                message: "Please fill the required fields!"
            });
        }

        const address = await Address.findOneAndUpdate(
            { _id: id, user: req.user.id },
            { street, city, province, postalCode, country },
            { new: true, runValidators: true }
        );

        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address Not Found!"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Address Updated Successfully!",
            address
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;

        const address = await Address.findOneAndDelete({ _id: id, user: req.user.id });
        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address Not Found!"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Address Deleted Successfully!"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
