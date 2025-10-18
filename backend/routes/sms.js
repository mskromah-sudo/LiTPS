import express from 'express';
import {
  handleIncomingSMS,
  getConversationHistory
} from '../controllers/twoWaySMSController.js';
import {
  sendBulkNotification,
  sendUrgentAlert
} from '../services/smsNotificationService.js';
import { protect, authorize } from '../middleware/auth.js';
import SMSService from '../services/smsService.js';

const router = express.Router();

// Webhook for incoming SMS (no authentication required)
router.post('/incoming', handleIncomingSMS);

// Protected routes
router.use(protect);

// @desc    Send bulk SMS
// @route   POST /api/sms/bulk
// @access  Private/Admin
router.post('/bulk', authorize('admin'), async (req, res) => {
  try {
    const { clientIds, message, templateType } = req.body;

    const result = await sendBulkNotification(clientIds, message, templateType);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Send urgent alert
// @route   POST /api/sms/urgent-alert
// @access  Private/Admin
router.post('/urgent-alert', authorize('admin'), async (req, res) => {
  try {
    const { shipmentId, alertType, customMessage } = req.body;

    const result = await sendUrgentAlert(shipmentId, alertType, customMessage);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Get SMS balance
// @route   GET /api/sms/balance
// @access  Private/Admin
router.get('/balance', authorize('admin'), async (req, res) => {
  try {
    const balance = await SMSService.getBalance();

    res.status(200).json({
      success: true,
      data: balance
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Get conversation history
// @route   GET /api/sms/conversations/:phoneNumber
// @access  Private/Admin
router.get('/conversations/:phoneNumber', authorize('admin'), getConversationHistory);

// @desc    Get SMS logs with filters
// @route   GET /api/sms/logs
// @access  Private/Admin
router.get('/logs', authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, gateway, templateType } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.status = status;
    if (gateway) filter.gateway = gateway;
    if (templateType) filter.templateType = templateType;

    const logs = await SMSLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SMSLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;