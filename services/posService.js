import axios from "axios";

const posClient = axios.create({
    baseURL: `https://${process.env.LIGHTSPEED_DOMAIN}.retail.lightspeed.app/api/2026-07`,
    headers: {
        "Authorization": `Bearer ${process.env.LIGHTSPEED_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
    },
    timeout: 55000 
});

// Generic paginated fetcher — reused across all endpoints
const fetchPaginated = async (endpoint, params = {}) => {
    const response = await posClient.get(endpoint, {
        params: {
            page_size: params.page_size || 250, // max allowed — fewer round trips
            ...(params.after  && { after: params.after }),
            ...(params.before && { before: params.before }),
            ...params.extra   // any endpoint-specific params
        }
    });
    return response.data;
};

export const getPOSProducts = async (params = {}) => {
    return fetchPaginated("/products", {
        ...params,
        extra: {
            ...(params.sku            && { sku: params.sku }),
            ...(params.name           && { name: params.name }),
            ...(params.deleted        !== undefined && { deleted: params.deleted }),
            ...(params.include_images !== undefined && { include_images: params.include_images })
        }
    });
};

export const getPOSProductById = async (id) => {
    const response = await posClient.get(`/products/${id}`);
    return response.data;
};

export const getPOSCategories = async (params = {}) => {
    return fetchPaginated("/product_categories", params);
};

export const getPOSInventory = async (params = {}) => {
    return fetchPaginated("/inventory", params);
};