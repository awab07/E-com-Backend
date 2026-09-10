import axios from "axios";

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const { data } = await axios.post(
        `${PAYPAL_API_BASE}/v1/oauth2/token`,
        "grant_type=client_credentials",
        {
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded"
            }
        }
    );

    cachedToken = data.access_token;
    // Refresh a minute early so we never hand out a token that expires mid-request.
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

export async function createPaypalOrder(totalAmount, currency = process.env.PAYPAL_CURRENCY || "USD") {
    const accessToken = await getAccessToken();

    const { data } = await axios.post(
        `${PAYPAL_API_BASE}/v2/checkout/orders`,
        {
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: currency,
                        value: totalAmount.toFixed(2)
                    }
                }
            ]
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    return data;
}

export async function capturePaypalOrder(paypalOrderId) {
    const accessToken = await getAccessToken();

    const { data } = await axios.post(
        `${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    return data;
}
