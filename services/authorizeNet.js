import axios from "axios";
import crypto from "crypto";

const AUTHORIZE_NET_API_BASE = process.env.AUTHORIZE_NET_MODE === "production"
    ? "https://api.authorize.net/xml/v1/request.api"
    : "https://apitest.authorize.net/xml/v1/request.api";

function getMerchantAuthentication() {
    return {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
    };
}

// Charges a card using the opaque data (payment nonce) produced by Accept.js
// in the browser — the raw card number/CVV never reaches this server.
export async function chargeCreditCard({ amount, opaqueData, invoiceNumber, description }) {
    const { data } = await axios.post(
        AUTHORIZE_NET_API_BASE,
        {
            createTransactionRequest: {
                merchantAuthentication: getMerchantAuthentication(),
                transactionRequest: {
                    transactionType: "authCaptureTransaction",
                    amount: amount.toFixed(2),
                    payment: {
                        opaqueData: {
                            dataDescriptor: opaqueData.dataDescriptor,
                            dataValue: opaqueData.dataValue
                        }
                    },
                    order: {
                        invoiceNumber,
                        description
                    }
                }
            }
        },
        { headers: { "Content-Type": "application/json" } }
    );

    return data;
}

// Verifies the X-ANET-Signature header Authorize.Net sends with webhook
// notifications, using HMAC-SHA512 over the exact raw request body.
export function verifyWebhookSignature(rawBody, signatureHeader) {
    if (!signatureHeader) return false;

    const expected = crypto
        .createHmac("sha512", process.env.AUTHORIZE_NET_SIGNATURE_KEY)
        .update(rawBody)
        .digest("hex")
        .toUpperCase();

    const received = signatureHeader.replace(/^sha512=/i, "").toUpperCase();

    const expectedBuf = Buffer.from(expected, "utf8");
    const receivedBuf = Buffer.from(received, "utf8");
    if (expectedBuf.length !== receivedBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
