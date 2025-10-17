const Shipment = require('..models/Shipment');

// @desc    Get all shipments for client
// @route   GET /api/shipments
// @access  Private
exports.getShipments = async (req, res) => {
  try {
    let query = {};
    
    // If user is client, only show their shipments
    if (req.user.role === 'client') {
      query.client = req.user.id;
    }

    const shipments = await Shipment.find(query)
      .populate('client', 'companyName email phone')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: shipments.length,
      data: shipments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single shipment
// @route   GET /api/shipments/:id
// @access  Private
exports.getShipment = async (req, res) => {
  try {
    let query = { _id: req.params.id };
    
    // If user is client, ensure they own the shipment
    if (req.user.role === 'client') {
      query.client = req.user.id;
    }

    const shipment = await Shipment.findOne(query)
      .populate('client', 'companyName email phone');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Shipment not found'
      });
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
};

// @desc    Track shipment by tracking number
// @route   GET /api/shipments/track/:trackingNumber
// @access  Public
exports.trackShipment = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ 
      trackingNumber: req.params.trackingNumber 
    }).populate('client', 'companyName');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Shipment not found'
      });
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
};

// @desc    Create new shipment
// @route   POST /api/shipments
// @access  Private
exports.createShipment = async (req, res) => {
  try {
    // Add client to request body
    req.body.client = req.user.id;

    const shipment = await Shipment.create(req.body);

    res.status(201).json({
      success: true,
      data: shipment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update shipment status
// @route   PUT /api/shipments/:id/status
// @access  Private (Admin/Agent only)
exports.updateStatus = async (req, res) => {
  try {
    const { status, description, location } = req.body;

    const shipment = await Shipment.findById(req.params.id);

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
      location: location || 'Freeport of Monrovia'
    });

    await shipment.save();

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
};