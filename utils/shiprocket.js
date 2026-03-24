const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

let tokenCache = {
    token: null,
    expiresAt: 0,
};

const getCredentials = () => {
    const email = (process.env.SHIPROCKET_EMAIL || process.env.SHIPROCKET_API_EMAIL || '').trim();
    const password = (process.env.SHIPROCKET_PASSWORD || process.env.SHIPROCKET_API_PASSWORD || '').trim();

    if (!email || !password) {
        throw new Error('Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in backend/.env.');
    }

    return { email, password };
};

const authenticate = async (forceRefresh = false) => {
    if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > Date.now()) {
        return tokenCache.token;
    }

    const { email, password } = getCredentials();
    const response = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok || !data?.token) {
        if (response.status === 403) {
            throw new Error('Shiprocket login was rejected with 403 Forbidden. Verify the Shiprocket email/password in backend/.env and confirm the same credentials can log in at app.shiprocket.in.');
        }
        throw new Error(data?.message || 'Failed to authenticate with Shiprocket.');
    }

    tokenCache = {
        token: data.token,
        expiresAt: Date.now() + (8 * 60 * 1000),
    };

    return data.token;
};

const shiprocketRequest = async (path, options = {}, retry = true) => {
    const token = await authenticate(false);
    const response = await fetch(`${SHIPROCKET_BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (response.status === 401 && retry) {
        await authenticate(true);
        return shiprocketRequest(path, options, false);
    }

    if (!response.ok) {
        throw new Error(data?.message || data?.error || `Shiprocket request failed with status ${response.status}`);
    }

    return data;
};

// ==================== ORDER MANAGEMENT ====================
const createAdhocOrder = async (payload) => {
    return shiprocketRequest('/orders/create/adhoc', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

const getOrders = async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('shipment_status', filters.status);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    const queryString = params.toString();
    const response = await shiprocketRequest(`/orders${queryString ? '?' + queryString : ''}`, {
        method: 'GET',
    });
    // Extract array from response - Shiprocket returns { data: [...orders...] }
    return Array.isArray(response) ? response : (response?.data || response?.orders || []);
};

const getOrderDetails = async (orderId) => {
    return shiprocketRequest(`/orders/${orderId}`, {
        method: 'GET',
    });
};

const updateOrder = async (orderId, payload) => {
    return shiprocketRequest(`/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
};

const cancelOrder = async (orderId) => {
    return shiprocketRequest(`/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
};

// ==================== SHIPMENT MANAGEMENT ====================
const assignAwb = async ({ shipmentId, courierId }) => {
    const body = {
        shipment_id: String(shipmentId),
    };

    if (courierId) {
        body.courier_id = String(courierId);
    }

    return shiprocketRequest('/courier/assign/awb', {
        method: 'POST',
        body: JSON.stringify(body),
    });
};

const generatePickup = async ({ shipmentId }) => {
    return shiprocketRequest('/courier/generate/pickup', {
        method: 'POST',
        body: JSON.stringify({
            shipment_id: [Number(shipmentId)],
        }),
    });
};

const cancelShipment = async ({ shipmentId }) => {
    return shiprocketRequest('/shipments/cancel', {
        method: 'POST',
        body: JSON.stringify({
            shipment_id: shipmentId,
        }),
    });
};

const getShipmentDetails = async (shipmentId) => {
    return shiprocketRequest(`/shipments/${shipmentId}`, {
        method: 'GET',
    });
};

// ==================== TRACKING ====================
const trackByAwb = async (awbCode) => {
    return shiprocketRequest(`/courier/track/awb/${encodeURIComponent(awbCode)}`, {
        method: 'GET',
    });
};

const trackByOrderId = async (orderId) => {
    return shiprocketRequest(`/orders/${orderId}/track`, {
        method: 'GET',
    });
};

const trackByShipmentId = async (shipmentId) => {
    return shiprocketRequest(`/shipments/${shipmentId}/track`, {
        method: 'GET',
    });
};

// ==================== COURIERS ====================
const getCouriers = async () => {
    const response = await shiprocketRequest('/couriers', {
        method: 'GET',
    });
    // Extract array from response - Shiprocket returns { data: [...couriers...] }
    return Array.isArray(response) ? response : (response?.data || response?.couriers || []);
};

const getAvailableCouriers = async (payload) => {
    return shiprocketRequest('/courier/serviceability', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

const getCourierIntegrations = async () => {
    const response = await shiprocketRequest('/courier/integrations', {
        method: 'GET',
    });
    // Extract array from response - Shiprocket returns { data: [...couriers...] }
    return Array.isArray(response) ? response : (response?.data || response?.courier || []);
};

// ==================== LABELS & MANIFESTS ====================
const generateLabel = async (shipmentIds) => {
    return shiprocketRequest('/labels/generate', {
        method: 'POST',
        body: JSON.stringify({
            shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds],
        }),
    });
};

const generateManifest = async (shipmentIds) => {
    return shiprocketRequest('/manifests/generate', {
        method: 'POST',
        body: JSON.stringify({
            shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds],
        }),
    });
};

const downloadLabel = async (shipmentId) => {
    return shiprocketRequest(`/labels/${shipmentId}`, {
        method: 'GET',
    });
};

// ==================== PICKUP ADDRESSES ====================
const getPickupAddresses = async () => {
    const response = await shiprocketRequest('/pickup_addresses', {
        method: 'GET',
    });
    // Extract array from response - Shiprocket returns { data: [...addresses...] }
    return Array.isArray(response) ? response : (response?.data || response?.addresses || []);
};

const createPickupAddress = async (payload) => {
    return shiprocketRequest('/pickup_addresses', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

const updatePickupAddress = async (addressId, payload) => {
    return shiprocketRequest(`/pickup_addresses/${addressId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
};

const deletePickupAddress = async (addressId) => {
    return shiprocketRequest(`/pickup_addresses/${addressId}`, {
        method: 'DELETE',
    });
};

// ==================== SHIPPING RATES ====================
const getShippingRates = async (payload) => {
    return shiprocketRequest('/courier/serviceability', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

// ==================== ACCOUNT & SETTINGS ====================
const getAccountDetails = async () => {
    return shiprocketRequest('/account', {
        method: 'GET',
    });
};

const getWalletBalance = async () => {
    return shiprocketRequest('/account/wallet', {
        method: 'GET',
    });
};

// ==================== NDR (Non-Delivery Reports) ====================
const getNDROrders = async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    const queryString = params.toString();
    const response = await shiprocketRequest(`/ndr${queryString ? '?' + queryString : ''}`, {
        method: 'GET',
    });
    // Extract array from response - Shiprocket returns { data: [...ndr...] }
    return Array.isArray(response) ? response : (response?.data || response?.ndr || []);
};

const updateNDRResolution = async (awbCode, resolution) => {
    return shiprocketRequest(`/ndr/${awbCode}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution }),
    });
};

// ==================== RETURN & EXCHANGE ====================
const createReturnOrder = async (payload) => {
    return shiprocketRequest('/return/create', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

const trackReturnOrder = async (returnOrderId) => {
    return shiprocketRequest(`/return/${returnOrderId}/track`, {
        method: 'GET',
    });
};

// ==================== BATCH OPERATIONS ====================
const bulkAssignAwb = async (shipmentIds) => {
    return shiprocketRequest('/courier/assign/awb/bulk', {
        method: 'POST',
        body: JSON.stringify({
            shipment_ids: shipmentIds,
        }),
    });
};

const bulkGeneratePickup = async (shipmentIds) => {
    return shiprocketRequest('/courier/generate/pickup/bulk', {
        method: 'POST',
        body: JSON.stringify({
            shipment_ids: shipmentIds,
        }),
    });
};

module.exports = {
    // Orders
    createAdhocOrder,
    getOrders,
    getOrderDetails,
    updateOrder,
    cancelOrder,
    
    // Shipments
    assignAwb,
    generatePickup,
    cancelShipment,
    getShipmentDetails,
    
    // Tracking
    trackByAwb,
    trackByOrderId,
    trackByShipmentId,
    
    // Couriers
    getCouriers,
    getAvailableCouriers,
    getCourierIntegrations,
    
    // Labels & Manifests
    generateLabel,
    generateManifest,
    downloadLabel,
    
    // Pickup Addresses
    getPickupAddresses,
    createPickupAddress,
    updatePickupAddress,
    deletePickupAddress,
    
    // Rates
    getShippingRates,
    
    // Account
    getAccountDetails,
    getWalletBalance,
    
    // NDR
    getNDROrders,
    updateNDRResolution,
    
    // Return & Exchange
    createReturnOrder,
    trackReturnOrder,
    
    // Batch
    bulkAssignAwb,
    bulkGeneratePickup,
    
    // Auth
    authenticate,
};
