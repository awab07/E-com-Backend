import axios from "axios";

const posClient = axios.create({
    baseURL: `https://${process.env.LIGHTSPEED_DOMAIN}.retail.lightspeed.app/api/2026-07`,
    headers: {
        "Authorization": `Bearer ${process.env.LIGHTSPEED_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
    },
    timeout: 55000
});

// Lightspeed's pagination isn't consistent across endpoints — each of these
// three normalizes its endpoint's own shape into a plain { data, nextCursor }.

// /products pages by version number: a page's own max version is the `after`
// value that fetches the next one. No cursor field is returned at all.
export const getPOSProducts = async (params = {}) => {
    const response = await posClient.get("/products", {
        params: {
            page_size: params.page_size || 250,
            ...(params.after  !== undefined && { after: params.after }),
            ...(params.before !== undefined && { before: params.before }),
            ...(params.sku            && { sku: params.sku }),
            ...(params.name           && { name: params.name }),
            ...(params.deleted        !== undefined && { deleted: params.deleted }),
            ...(params.include_images !== undefined && { include_images: params.include_images })
        }
    });
    const data = response.data.data;
    return {
        data,
        nextCursor: data.length > 0 ? response.data.version?.max ?? null : null
    };
};

export const getPOSProductById = async (id) => {
    const response = await posClient.get(`/products/${id}`);
    return response.data;
};

// /product_categories pages with an opaque last-seen id, nested two levels
// deep: { data: { page_info: { has_next, last_seen }, data: { categories } } }.
export const getPOSCategories = async (params = {}) => {
    const response = await posClient.get("/product_categories", {
        params: {
            page_size: params.page_size || 250,
            ...(params.after && { after: params.after })
        }
    });
    const body = response.data.data;
    return {
        data: body.data.categories,
        nextCursor: body.page_info?.has_next ? body.page_info.last_seen : null
    };
};

// Inventory is its own thing: POST (not GET) /inventory_levels with an
// offset/size body, returning a bare array (no wrapper, no total count) —
// a short page (< size) is the only way to tell you've reached the end.
export const getPOSInventoryLevels = async (params = {}) => {
    const offset = params.offset || 0;
    const size = params.size || 250;
    const response = await posClient.post("/inventory_levels", {
        offset,
        size,
        ...(params.location_ids && { location_ids: params.location_ids }),
        ...(params.product_ids  && { product_ids: params.product_ids })
    });
    const data = response.data;
    return {
        data,
        nextOffset: data.length === size ? offset + size : null
    };
};

// ---- Bulk helpers built on the pagers above, used by the sync job ----

export const fetchAllPOSCategories = async () => {
    const all = [];
    let after;
    do {
        const { data, nextCursor } = await getPOSCategories({ page_size: 250, after });
        all.push(...data);
        after = nextCursor;
    } while (after);
    return all;
};

// Map<lightspeed_product_id, totalStock> — summed across outlets in case
// this account ever has more than the one location it has today.
export const fetchPOSInventoryMap = async () => {
    const map = new Map();
    let offset = 0;
    while (true) {
        const { data, nextOffset } = await getPOSInventoryLevels({ offset, size: 250 });
        for (const level of data) {
            map.set(level.product_id, (map.get(level.product_id) || 0) + (level.current_inventory_level || 0));
        }
        if (nextOffset === null) break;
        offset = nextOffset;
    }
    return map;
};

// Streams product pages to onPage() so a caller can upsert as it goes rather
// than holding all ~5k products in memory. Stops early (reporting where it
// left off) once shouldStop() flips true, so a time-boxed HTTP handler can
// resume the walk on a later call instead of risking a platform timeout.
export const streamAllPOSProducts = async ({ after, shouldStop, onPage }) => {
    let cursor = after;
    while (true) {
        const { data, nextCursor } = await getPOSProducts({ page_size: 250, after: cursor });
        if (data.length === 0) return { done: true, cursor };

        await onPage(data);

        const isLastPage = data.length < 250 || !nextCursor;
        if (isLastPage) return { done: true, cursor: nextCursor };

        cursor = nextCursor;
        if (shouldStop && shouldStop()) return { done: false, cursor };
    }
};
