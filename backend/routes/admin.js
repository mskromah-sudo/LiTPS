import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import User from '../models/user.js';
import Shipment from '../models/Shipment.js';
import Quote from '../models/Quote.js';
import { sendEmail, emailTemplates } from '../utils/emailService.js';

const router = express.Router();

// All admin routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
router.get('/dashboard', async (req, res) => {
  try {
    // Get counts
    const totalUsers = await User.countDocuments();
    const totalShipments = await Shipment.countDocuments();
    const totalQuotes = await Quote.countDocuments();
    const pendingShipments = await Shipment.countDocuments({ status: 'pending' });
    const completedShipments = await Shipment.countDocuments({ status: 'delivered' });

    // Get recent activities
    const recentShipments = await Shipment.find()
      .populate('client', 'companyName email')
      .sort({ createdAt: -1 })
      .limit(10);

    const recentQuotes = await Quote.find()
      .populate('client', 'companyName email')
      .sort({ createdAt: -1 })
      .limit(10);

    // Revenue calculation (simplified)
    const revenueData = await Shipment.aggregate([
      {
        $match: { status: 'delivered' }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalRevenue: { $sum: '$cargoDetails.value' }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      },
      {
        $limit: 6
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        counts: {
          totalUsers,
          totalShipments,
          totalQuotes,
          pendingShipments,
          completedShipments
        },
        recentShipments,
        recentQuotes,
        revenueData
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Get all users with pagination
// @route   GET /api/admin/users
// @access  Private/Admin
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
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

// @desc    Get all shipments with filters
// @route   GET /api/admin/shipments
// @access  Private/Admin
router.get('/shipments', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, client, dateFrom, dateTo } = req.query;

    let filter = {};
    if (status) filter.status = status;
    if (client) filter.client = client;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const shipments = await Shipment.find(filter)
      .populate('client', 'companyName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Shipment.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: shipments,
      pagination: {
        page,
        limit,
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

// @desc    Update shipment status
// @route   PUT /api/admin/shipments/:id/status
// @access  Private/Admin
router.put('/shipments/:id/status', async (req, res) => {
  try {
    const { status, description, location, notifyClient } = req.body;

    const shipment = await Shipment.findById(req.params.id).populate('client');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Shipment not found'
      });
    }

    // Update status
    shipment.status = status;

    // Add to timeline
    shipment.timeline.push({
      status,
      description: description || `Status updated to ${status}`,
      location: location || 'Freeport of Monrovia',
      timestamp: new Date()
    });

    await shipment.save();

    // Notify client if requested
    if (notifyClient && shipment.client) {
      try {
        await sendEmail({
          to: shipment.client.email,
          ...emailTemplates.shipmentUpdate(shipment, shipment.client)
        });
      } catch (emailError) {
        console.log('Notification email failed:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      data: shipment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Get all quotes
// @route   GET /api/admin/quotes
// @access  Private/Admin
router.get('/quotes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    let filter = {};
    if (status) filter.status = status;

    const quotes = await Quote.find(filter)
      .populate('client', 'companyName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Quote.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: quotes,
      pagination: {
        page,
        limit,
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

// @desc    Update quote status
// @route   PUT /api/admin/quotes/:id
// @access  Private/Admin
router.put('/quotes/:id', async (req, res) => {
  try {
    const { status, finalAmount, notes, assignedTo } = req.body;

    const quote = await Quote.findByIdAndUpdate(
      req.params.id,
      { status, finalAmount, notes, assignedTo },
      { new: true, runValidators: true }
    ).populate('client');

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Notify client if quote is accepted
    if (status === 'accepted' && quote.client) {
      try {
        await sendEmail({
          to: quote.client.email,
          ...emailTemplates.quoteResponse(quote, quote.client)
        });
      } catch (emailError) {
        console.log('Quote notification email failed:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      data: quote
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Create new user (admin only)
// @route   POST /api/admin/users
// @access  Private/Admin
router.post('/users', async (req, res) => {
  try {
    const { companyName, email, phone, password, role, contactPerson } = req.body;

    const user = await User.create({
      companyName,
      email,
      phone,
      password: password || generateRandomPassword(),
      role: role || 'client',
      contactPerson,
      isVerified: true
    });

    // Send welcome email
    try {
      await sendEmail({
        to: user.email,
        ...emailTemplates.welcome(user)
      });
    } catch (emailError) {
      console.log('Welcome email failed:', emailError);
    }

    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
router.put('/users/:id', async (req, res) => {
  try {
    const { companyName, email, phone, role, contactPerson, isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { companyName, email, phone, role, contactPerson, isActive },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Helper function to generate random password
const generateRandomPassword = () => {
  return Math.random().toString(36).slice(-8);
};

export default router;