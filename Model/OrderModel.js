import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },


        isGuestOrder: {
            type: Boolean,
            default: false
        },


        guestInfo: {
            firstName: {
                type: String,
                trim: true
            },

            lastName: {
                type: String,
                trim: true
            },

            email: {
                type: String,
                lowercase: true,
                trim: true
            },

            phone: {
                type: String,
                trim: true
            }
        },

        items: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true
                },

                quantity: {
                    type: Number,
                    required: true,
                    min: 1
                },

                price: {
                    type: Number,
                    required: true
                }
            }
        ],

        totalAmount: {
            type: Number,
            required: true
        },

        totalItems: {
            type: Number,
            required: true
        },

        shippingAddress: {
            street: {
                type: String,
                required: true
            },

            city: {
                type: String,
                required: true
            },

            province: {
                type: String,
                required: true
            },

            postalCode: {
                type: String,
            },

            country: {
                type: String,
                required: true
            }
        },

        paymentMethod: {
            type: String,
            enum: [
                "Cash On Delivery",
                "Stripe",
                "JazzCash",
                "EasyPaisa"
            ],
            default: "Cash On Delivery"
        },

        paymentStatus: {
            type: String,
            enum: [
                "pending",
                "paid",
                "failed"
            ],
            default: "pending"
        },

        status: {
            type: String,
            enum: [
                "pending",
                "confirmed",
                "shipped",
                "delivered",
                "cancelled"
            ],
            default: "pending"
        },
        estimatedDelivery: {
            type: Date,
            required: true
        },
        isArchived: {
            type: Boolean,
            default: false
        },
        deliveredAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ isArchived: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ deliveredAt: 1 });

export const Order = mongoose.model("Order", orderSchema);