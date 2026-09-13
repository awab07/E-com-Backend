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

// Pulls one storefront's Lightspeed catalogue into the shared Product
// collection, tagged with that storefront's own `site` value. Defaults to
// site=triplebuzz; pass ?site=doubleapple for Double Apple's own account —
// each site's Lightspeed credentials and posId space are fully separate, so
// one storefront's sync can never touch the other's products. Time-boxed
// per call — see syncPOSProducts for the resume-with-?after= flow on a full
// catalogue.
posRouter.post("/sync/products",    protection, isAdmin, syncPOSProducts);

export default posRouter;