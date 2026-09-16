import { transporter } from "./Mailer.js";


export const sendOTPEmail = async (email, otp) => {
    try {
        await transporter.sendMail({
            from: `${process.env.MAIL_USER}`,
            to: email,
            subject: "Email Verification OTP",
            html: `
                <div style="font-family: Arial; padding: 10px;">
                    <h2>Email Verification</h2>
                    <p>Your OTP code is:</p>
                    <h1 style="color: #1ce923;">${otp}</h1>
                    <p>This OTP will expire in 5 minutes.</p>
                </div>
            `
        });
        console.log("OTP Email sent successfully");
    } catch (error) {
        console.log("Email sending failed:", error.message);
    }
};

// Sent right after an order is successfully placed (Cash On Delivery, or a
// paid PayPal/Authorize.Net charge) — never called for a failed/cancelled
// order. `order` must already have `items.product` populated so item names
// are available; `orderId` uses the same short trailing-slice-of-the-Mongo-_id
// convention the Double Apple storefront's Profile "My Orders" list already
// shows customers (e.g. "Order #A1B2C3D4") — not the longer slice(-20) used
// elsewhere in this file for the Authorize.Net invoice number, which is an
// internal API field rather than something a customer reads.
export const sendOrderConfirmationEmail = async ({ toEmail, customerName, order }) => {
    try {
        const orderId = order._id.toString().slice(-8).toUpperCase();
        const address = order.shippingAddress || {};

        const itemsHtml = order.items
            .map((item) => {
                const name = item.product?.name || "Item";
                const lineTotal = (item.price * item.quantity).toFixed(2);
                return `
                    <tr>
                        <td style="padding:8px;border-bottom:1px solid #eee;">${name}</td>
                        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
                        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${item.price.toFixed(2)}</td>
                        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${lineTotal}</td>
                    </tr>
                `;
            })
            .join("");

        await transporter.sendMail({
            from: `${process.env.MAIL_USER}`,
            to: toEmail,
            subject: `Order Confirmation - #${orderId}`,
            html: `
                <div style="font-family: Arial; padding: 10px; max-width: 600px;">
                    <h2>Thank you for your order${customerName ? `, ${customerName}` : ""}!</h2>
                    <p>Your order has been placed successfully.</p>
                    <p><strong>Order ID:</strong> ${orderId}</p>

                    <h3>Shipping Address</h3>
                    <p>
                        ${address.street || ""}<br/>
                        ${address.city || ""}, ${address.province || ""} ${address.postalCode || ""}<br/>
                        ${address.country || ""}
                    </p>

                    <h3>Order Items</h3>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr>
                                <th style="text-align:left;padding:8px;border-bottom:2px solid #333;">Item</th>
                                <th style="text-align:center;padding:8px;border-bottom:2px solid #333;">Qty</th>
                                <th style="text-align:right;padding:8px;border-bottom:2px solid #333;">Price</th>
                                <th style="text-align:right;padding:8px;border-bottom:2px solid #333;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <p style="margin-top:16px;font-size:16px;"><strong>Total: $${order.totalAmount.toFixed(2)}</strong></p>
                </div>
            `
        });
        console.log("Order confirmation email sent successfully");
    } catch (error) {
        console.log("Order confirmation email sending failed:", error.message);
    }
};