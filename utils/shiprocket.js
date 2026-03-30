const DEFAULT_SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

let tokenCache = {
    token: null,
    expiresAt: 0,
    authData: null,
};

const getShiprocketBaseUrl = () => (
    process.env.SHIPROCKET_API_URL ||
    process.env.SHIPROCKET_BASE_URL ||
    DEFAULT_SHIPROCKET_BASE_URL
).trim().replace(/\/+$/, '');

const readJsonResponse = async (response) => {
    const text = await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return {
            message: text,
        };
    }
};

const getCredentials = () => {
    const email = (process.env.SHIPROCKET_API_EMAIL || process.env.SHIPROCKET_EMAIL || '').trim();
    const password = (process.env.SHIPROCKET_API_PASSWORD || process.env.SHIPROCKET_PASSWORD || '').trim();

    if (!email || !password) {
        throw new Error('Shiprocket is not configured. Set SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD in backend/.env (or SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD as fallback).');
    }

    return { email, password };
};

const maskEmail = (email) => {
    if (!email || !email.includes('@')) return '';
    const [local, domain] = email.split('@');
    const safeLocal = local.length <= 3 ? `${local[0] || ''}***` : `${local.slice(0, 3)}***`;
    return `${safeLocal}@${domain}`;
};

const getDiagnosticConfig = () => {
    const email = (process.env.SHIPROCKET_API_EMAIL || process.env.SHIPROCKET_EMAIL || '').trim();
    const password = (process.env.SHIPROCKET_API_PASSWORD || process.env.SHIPROCKET_PASSWORD || '').trim();

    return {
        emailMasked: maskEmail(email),
        usingApiEmail: Boolean(process.env.SHIPROCKET_API_EMAIL),
        usingApiPassword: Boolean(process.env.SHIPROCKET_API_PASSWORD),
        usingFallbackEmail: !process.env.SHIPROCKET_API_EMAIL && Boolean(process.env.SHIPROCKET_EMAIL),
        usingFallbackPassword: !process.env.SHIPROCKET_API_PASSWORD && Boolean(process.env.SHIPROCKET_PASSWORD),
        passwordLength: password.length,
        pickupLocation: (process.env.SHIPROCKET_PICKUP_LOCATION || '').trim(),
        baseUrl: getShiprocketBaseUrl(),
    };
};

const authenticate = async (forceRefresh = false) => {
    if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > Date.now()) {
        return tokenCache.token;
    }

    const { email, password } = getCredentials();
    const response = await fetch(`${getShiprocketBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });

    const data = await readJsonResponse(response);
    if (!response.ok || !data?.token) {
        if (response.status === 403) {
            throw new Error('Shiprocket login was rejected with 403 Forbidden. Use the Shiprocket API user credentials in backend/.env, not the main Shiprocket account login. Verify SHIPROCKET_API_EMAIL/SHIPROCKET_API_PASSWORD and confirm this API user is allowed for the configured IP in Shiprocket.');
        }
        throw new Error(data?.message || 'Failed to authenticate with Shiprocket.');
    }

    tokenCache = {
        token: data.token,
        expiresAt: Date.now() + (8 * 60 * 1000),
        authData: data,
    };

    return data.token;
};

const shiprocketRequest = async (path, options = {}, retry = true) => {
    const token = await authenticate(false);
    const response = await fetch(`${getShiprocketBaseUrl()}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const data = await readJsonResponse(response);

    if (response.status === 401 && retry) {
        await authenticate(true);
        return shiprocketRequest(path, options, false);
    }

    if (!response.ok) {
        const error = new Error(data?.message || data?.error || `Shiprocket request failed with status ${response.status}`);
        error.statusCode = response.status;
        error.payload = data;
        throw error;
    }

    return data;
};

const appendServiceabilityParam = (params, key, value) => {
    if (value === undefined || value === null || value === '') {
        return;
    }

    params.append(key, String(value));
};

const buildServiceabilityPath = (payload = {}) => {
    const params = new URLSearchParams();

    appendServiceabilityParam(params, 'pickup_postcode', payload.pickup_postcode);
    appendServiceabilityParam(params, 'delivery_postcode', payload.delivery_postcode);
    appendServiceabilityParam(params, 'cod', payload.cod);
    appendServiceabilityParam(params, 'weight', payload.weight);
    appendServiceabilityParam(params, 'length', payload.length);
    appendServiceabilityParam(params, 'breadth', payload.breadth);
    appendServiceabilityParam(params, 'height', payload.height);
    appendServiceabilityParam(params, 'declared_value', payload.declared_value);
    appendServiceabilityParam(params, 'is_return', payload.is_return);
    appendServiceabilityParam(params, 'courier_id', payload.courier_id);
    appendServiceabilityParam(params, 'mode', payload.mode || 'Surface');

    const queryString = params.toString();
    return `/courier/serviceability${queryString ? `?${queryString}` : ''}`;
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
    try {
        const response = await shiprocketRequest('/couriers', {
            method: 'GET',
        });
        // Extract array from response - Shiprocket returns { data: [...couriers...] }
        return Array.isArray(response) ? response : (response?.data || response?.couriers || []);
    } catch (error) {
        if (error?.statusCode === 404) {
            return [];
        }
        throw error;
    }
};

const getAvailableCouriers = async (payload) => {
    return shiprocketRequest(buildServiceabilityPath(payload), {
        method: 'GET',
    });
};

const getCourierIntegrations = async () => {
    // Shiprocket currently returns 404 for /courier/integrations on this account.
    // Keep the dashboard operational by returning an empty list instead of failing hard.
    return [];
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
const normalizePickupAddresses = (response) => {
    const shippingAddresses = response?.data?.shipping_address;
    if (Array.isArray(shippingAddresses)) {
        return shippingAddresses;
    }

    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.addresses)) {
        return response.addresses;
    }

    return [];
};

const getPickupAddresses = async () => {
    try {
        const response = await shiprocketRequest('/pickup_addresses', {
            method: 'GET',
        });
        return normalizePickupAddresses(response);
    } catch (error) {
        if (error?.statusCode !== 404) {
            throw error;
        }

        const fallbackResponse = await shiprocketRequest('/settings/company/pickup', {
            method: 'GET',
        });
        return normalizePickupAddresses(fallbackResponse);
    }
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
    return getAvailableCouriers(payload);
};

// ==================== ACCOUNT & SETTINGS ====================
const getAccountDetails = async () => {
    await authenticate(false);

    const authData = tokenCache.authData || {};
    const pickupAddresses = await getPickupAddresses();

    return {
        id: authData.id || null,
        company_id: authData.company_id || null,
        email: authData.email || null,
        first_name: authData.first_name || null,
        last_name: authData.last_name || null,
        business_type: authData.business_type || 'Shiprocket',
        status: authData.token ? 'connected' : 'unknown',
        pickup_locations_count: pickupAddresses.length,
        pickup_locations: pickupAddresses.map((address) => ({
            id: address?.id || null,
            pickup_location: address?.pickup_location || address?.warehouse_name || null,
            city: address?.city || null,
            state: address?.state || null,
        })),
        source: 'shiprocket-auth-login',
    };
};

const getWalletBalance = async () => {
    // Shiprocket currently returns 404 for /account/wallet on this account.
    // Return a non-failing placeholder payload so the dashboard remains usable.
    return {
        balance: 0,
        available_balance: 0,
        unsupported: true,
        message: 'Wallet balance endpoint is not exposed by the current Shiprocket API response for this account.',
        source: 'shiprocket-wallet-fallback',
    };
};

// ==================== NDR (Non-Delivery Reports) ====================
const getNDROrders = async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    const queryString = params.toString();
    try {
        const response = await shiprocketRequest(`/ndr${queryString ? '?' + queryString : ''}`, {
            method: 'GET',
        });
        // Extract array from response - Shiprocket returns { data: [...ndr...] }
        return Array.isArray(response) ? response : (response?.data || response?.ndr || []);
    } catch (error) {
        if (error?.statusCode === 404) {
            return [];
        }
        throw error;
    }
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
    getDiagnosticConfig,
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
