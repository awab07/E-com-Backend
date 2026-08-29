import {
    getPOSProducts,
    getPOSProductById,
    getPOSCategories,
    getPOSInventory
} from "../services/posService.js";


const handleCursorPagination = async (fetchFn, params, res) => {
    try {
        const data = await fetchFn(params);
        return res.status(200).json({
            success:    true,
            data:       data.data ?? data,         
            nextCursor: data.pagination?.next_cursor  ?? null,
            prevCursor: data.pagination?.prev_cursor  ?? null,
            hasNext:    !!data.pagination?.next_cursor,
            hasPrev:    !!data.pagination?.prev_cursor
        });

    } catch (error) {
        const status = error.response?.status || 500;
        return res.status(status).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

export const fetchPOSProducts = async (req, res) => {
    const {
        after,
        before,
        page_size,
        sku,
        name,
        deleted,
        include_images
    } = req.query;

    await handleCursorPagination(
        getPOSProducts,
        {
            after,
            before,
            page_size: Math.min(parseInt(page_size) || 250, 250),
            sku,
            name,
            deleted:        deleted !== undefined ? deleted === "true" : undefined,
            include_images: include_images !== undefined ? include_images === "true" : undefined
        },
        res
    );
};

export const fetchPOSProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await getPOSProductById(id);
        return res.status(200).json({ success: true, product });
    } catch (error) {
        const status = error.response?.status || 500;
        return res.status(status).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

export const fetchPOSCategories = async (req, res) => {
    const { after, before, page_size } = req.query;

    await handleCursorPagination(
        getPOSCategories,
        {
            after,
            before,
            page_size: Math.min(parseInt(page_size) || 250, 250)
        },
        res
    );
};

export const fetchPOSInventory = async (req, res) => {
    const { after, before, page_size } = req.query;

    await handleCursorPagination(
        getPOSInventory,
        {
            after,
            before,
            page_size: Math.min(parseInt(page_size) || 250, 250)
        },
        res
    );
};