import express from "express";
import {
    fetchPOSProducts,
    fetchPOSProductById,
    fetchPOSCategories,
    fetchPOSInventory,
    syncPOSProducts
} from "../Controllers/posController.js";
import { protection, isAdmin } from "../Middleware/Middleware.js";

const posRouter = express.Router();

posRouter.get("/products",          protection, isAdmin, fetchPOSProducts);
posRouter.get("/products/:id",      protection, isAdmin, fetchPOSProductById);
posRouter.get("/categories",        protection, isAdmin, fetchPOSCategories);
posRouter.get("/inventory",         protection, isAdmin, fetchPOSInventory);

// Pulls Triple Buzz's Lightspeed catalogue into the shared Product
// collection (site: "triplebuzz"), keyed by posId. Time-boxed per call —
// see syncPOSProducts for the resume-with-?after= flow on a full catalogue.
posRouter.post("/sync/products",    protection, isAdmin, syncPOSProducts);

export default posRouter;