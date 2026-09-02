import express from "express"
import cors from "cors"
import { PORT } from "./config.js"
import connectDB from "./db.js"
import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import userRoutes from "./Routes/userRoutes.js";
import { logger } from "./Middleware/Middleware.js";
import productRoutes from "./Routes/productRoutes.js";
import orderrouter from "./Routes/orderRoutes.js";
import addressRoutes from "./Routes/addressRoutes.js";
import { swaggerSpec } from "./services/swagger.js";
import cookieParser from "cookie-parser";
import posRouter from "./Routes/posRoutes.js";
import responseTime from "response-time";

dotenv.config();
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["1.1.1.1", "8.8.8.8"])

const app = express()

app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://double-apple.vercel.app",
        process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}))

app.use(express.json())

app.use((req, res, next) => {
    const start = performance.now();

    res.on("finish", () => {
        console.log(
            "ACTUAL APP REQUEST TIME:",
            (performance.now() - start).toFixed(2),
            "ms"
        );
    });

    next();
});
app.use(cookieParser());
app.use(logger)


app.get("/api-docs/spec", (req, res) => res.json(swaggerSpec));
app.get("/api-docs", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>E-Commerce API Docs</title>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">
        </head>
        <body>
            <div id="swagger-ui"></div>
            <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
            <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js"></script>
            <script>
                window.onload = function() {
                    SwaggerUIBundle({
                        url: "/api-docs/spec",
                        dom_id: '#swagger-ui',
                        deepLinking: true,
                        presets: [
                            SwaggerUIBundle.presets.apis,
                            SwaggerUIStandalonePreset
                        ],
                        layout: "StandaloneLayout"
                    })
                }
            </script>
        </body>
        </html>
    `);
});


app.use(async (req, res, next) => {
    if (mongoose.connection.readyState === 1) {
        return next();
    }
    try {
        await connectDB();
        next();
    } catch (err) {
        res.status(503).json({ message: "Database unavailable, please retry" });
    }
});

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is Running!",
        env: process.env.NODE_ENV
    })
})
app.use(responseTime())
app.use("/Api",     userRoutes)
app.use("/Product", productRoutes)
app.use("/Order",   orderrouter)
app.use("/Address", addressRoutes)
app.use("/POS",     posRouter)

async function startServer() {
    await connectDB();
    if (process.env.NODE_ENV !== "production") {
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    }
}

startServer().catch(err => console.error("Startup error:", err));

export default app;