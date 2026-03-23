const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

let tokenCache = {
    token: null,
    expiresAt: 0,
};

const getCredentials = () => {
    const email = process.env.SHIPROCKET_EMAIL || process.env.SHIPROCKET_API_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD || process.env.SHIPROCKET_API_PASSWORD;

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

const createAdhocOrder = async (payload) => {
    return shiprocketRequest('/orders/create/adhoc', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

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

const trackByAwb = async (awbCode) => {
    return shiprocketRequest(`/courier/track/awb/${encodeURIComponent(awbCode)}`, {
        method: 'GET',
    });
};

module.exports = {
    createAdhocOrder,
    assignAwb,
    generatePickup,
    trackByAwb,
};
