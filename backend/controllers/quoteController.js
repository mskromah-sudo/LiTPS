const Quote = require('../models/Quote');

// @desc    Calculate instant quote
// @route   POST /api/quotes/calculate
// @access  Public
exports.calculateQuote = async (req, res) => {
  try {
    const { serviceType, origin, cargoType, weight, volume, value, description } = req.body;

    // Base calculation logic
    let baseCost = 0;
    const serviceMultipliers = {
      'clearing': 1,
      'sea_freight': 2.5,
      'air_freight': 4,
      'full_logistics': 3
    };
    
    baseCost = serviceMultipliers[serviceType] * 500;
    
    const weightCost = weight * 2.5;
    const volumeCost = volume * 150;
    
    const cargoMultipliers = {
      'general': 1,
      'construction': 1.2,
      'vehicles': 1.5,
      'perishable': 1.8,
      'hazardous': 2.2
    };
    
    const calculatedAmount = (baseCost + weightCost + volumeCost) * cargoMultipliers[cargoType];

    // Save calculated quote
    const quote = await Quote.create({
      serviceType,
      origin,
      cargoType,
      cargoDetails: {
        description,
        weight,
        volume,
        value
      },
      calculatedAmount,
      status: 'calculated'
    });

    res.status(200).json({
      success: true,
      data: {
        calculatedAmount: calculatedAmount.toFixed(2),
        quoteId: quote._id
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Request detailed quote
// @route   POST /api/quotes/request-detailed
// @access  Public
exports.requestDetailedQuote = async (req, res) => {
  try {
    const { quoteId, companyName, email, phone } = req.body;

    const quote = await Quote.findByIdAndUpdate(
      quoteId,
      {
        clientInfo: { companyName, email, phone },
        status: 'requested'
      },
      { new: true }
    );

    // Here you would typically send an email notification to admin

    res.status(200).json({
      success: true,
      message: 'Detailed quote request submitted successfully. Our team will contact you within 2 hours.',
      data: quote
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all quotes (for admin) or client quotes
// @route   GET /api/quotes
// @access  Private
exports.getQuotes = async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'client') {
      query.client = req.user.id;
    }

    const quotes = await Quote.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: quotes.length,
      data: quotes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};