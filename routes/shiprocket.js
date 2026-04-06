const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
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
    getDiagnosticConfig,
    
    // NDR
    getNDROrders,
    updateNDRResolution,
    
    // Return & Exchange
    createReturnOrder,
    trackReturnOrder,
    
    // Batch
    bulkAssignAwb,
    bulkGeneratePickup,
} = require('../utils/shiprocket');

const router = express.Router();
const SHIPROCKET_MAINTENANCE_MESSAGE = 'Shiprocket is under maintenance right now. Please process shipments manually for the time being.';
const isShiprocketDisabled = () => process.env.SHIPROCKET_DISABLED === 'true';

// Middleware to check admin auth
const requireAdmin = adminAuth;

router.use((req, res, next) => {
    if (isShiprocketDisabled()) {
        return res.status(503).json({
            error: SHIPROCKET_MAINTENANCE_MESSAGE,
            maintenance: true,
        });
    }

    next();
});

const sendShiprocketError = (res, error) => {
    const message = error?.message || 'Shiprocket request failed';
    const statusCode = error?.statusCode;

    if (message.includes('Shiprocket is not configured')) {
        return res.status(503).json({ error: message });
    }

    if (
        message.includes('403 Forbidden') ||
        message.includes('Failed to authenticate with Shiprocket') ||
        message.includes('Access forbidden')
    ) {
        return res.status(502).json({ error: message });
    }

    if (typeof statusCode === 'number' && statusCode >= 400) {
        return res.status(statusCode).json({ error: message });
    }

    return res.status(400).json({ error: message });
};

// ==================== ORDERS ====================
router.post('/orders/create', requireAdmin, async (req, res) => {
    try {
        const result = await createAdhocOrder(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/orders', requireAdmin, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            limit: req.query.limit || 50,
            offset: req.query.offset || 0,
        };
        const result = await getOrders(filters);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/orders/:orderId', requireAdmin, async (req, res) => {
    try {
        const result = await getOrderDetails(req.params.orderId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.put('/orders/:orderId', requireAdmin, async (req, res) => {
    try {
        const result = await updateOrder(req.params.orderId, req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/orders/:orderId/cancel', requireAdmin, async (req, res) => {
    try {
        const result = await cancelOrder(req.params.orderId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== SHIPMENTS ====================
router.post('/shipments/assign-awb', requireAdmin, async (req, res) => {
    try {
        const result = await assignAwb(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/shipments/generate-pickup', requireAdmin, async (req, res) => {
    try {
        const result = await generatePickup(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/shipments/cancel', requireAdmin, async (req, res) => {
    try {
        const result = await cancelShipment(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/shipments/:shipmentId', requireAdmin, async (req, res) => {
    try {
        const result = await getShipmentDetails(req.params.shipmentId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== TRACKING ====================
router.get('/track/awb/:awbCode', async (req, res) => {
    try {
        const result = await trackByAwb(req.params.awbCode);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/track/order/:orderId', requireAdmin, async (req, res) => {
    try {
        const result = await trackByOrderId(req.params.orderId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/track/shipment/:shipmentId', requireAdmin, async (req, res) => {
    try {
        const result = await trackByShipmentId(req.params.shipmentId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== COURIERS ====================
router.get('/couriers', requireAdmin, async (req, res) => {
    try {
        const result = await getCouriers();
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/couriers/serviceability', requireAdmin, async (req, res) => {
    try {
        const result = await getAvailableCouriers(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/couriers/integrations', requireAdmin, async (req, res) => {
    try {
        const result = await getCourierIntegrations();
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== LABELS & MANIFESTS ====================
router.post('/labels/generate', requireAdmin, async (req, res) => {
    try {
        const result = await generateLabel(req.body.shipmentIds);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/manifests/generate', requireAdmin, async (req, res) => {
    try {
        const result = await generateManifest(req.body.shipmentIds);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/labels/:shipmentId', requireAdmin, async (req, res) => {
    try {
        const result = await downloadLabel(req.params.shipmentId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== PICKUP ADDRESSES ====================
router.get('/pickup-addresses', requireAdmin, async (req, res) => {
    try {
        const result = await getPickupAddresses();
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/pickup-addresses', requireAdmin, async (req, res) => {
    try {
        const result = await createPickupAddress(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.put('/pickup-addresses/:addressId', requireAdmin, async (req, res) => {
    try {
        const result = await updatePickupAddress(req.params.addressId, req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.delete('/pickup-addresses/:addressId', requireAdmin, async (req, res) => {
    try {
        const result = await deletePickupAddress(req.params.addressId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== ACCOUNT ====================
router.get('/account', requireAdmin, async (req, res) => {
    try {
        const result = await getAccountDetails();
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/debug-config', requireAdmin, async (req, res) => {
    try {
        res.json(getDiagnosticConfig());
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/wallet', requireAdmin, async (req, res) => {
    try {
        const result = await getWalletBalance();
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== SHIPPING RATES ====================
router.post('/rates', requireAdmin, async (req, res) => {
    try {
        const result = await getShippingRates(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== NDR ====================
router.get('/ndr', requireAdmin, async (req, res) => {
    try {
        const filters = {
            limit: req.query.limit || 50,
            offset: req.query.offset || 0,
        };
        const result = await getNDROrders(filters);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/ndr/:awbCode/resolve', requireAdmin, async (req, res) => {
    try {
        const result = await updateNDRResolution(req.params.awbCode, req.body.resolution);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== RETURNS ====================
router.post('/returns/create', requireAdmin, async (req, res) => {
    try {
        const result = await createReturnOrder(req.body);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.get('/returns/:returnOrderId', requireAdmin, async (req, res) => {
    try {
        const result = await trackReturnOrder(req.params.returnOrderId);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

// ==================== BATCH OPERATIONS ====================
router.post('/batch/assign-awb', requireAdmin, async (req, res) => {
    try {
        const result = await bulkAssignAwb(req.body.shipmentIds);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

router.post('/batch/generate-pickup', requireAdmin, async (req, res) => {
    try {
        const result = await bulkGeneratePickup(req.body.shipmentIds);
        res.json(result);
    } catch (error) {
        sendShiprocketError(res, error);
    }
});

module.exports = router;
