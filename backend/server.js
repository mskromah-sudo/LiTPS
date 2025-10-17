import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Test route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Liberia Clearing & Forwarding API is running! 🚀',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    database: 'mock_mode',
    timestamp: new Date().toISOString()
  });
});

// Mock Tracking System
app.get('/api/shipments/track/:trackingNumber', (req, res) => {
  const { trackingNumber } = req.params;
  
  const mockShipment = {
    trackingNumber: trackingNumber,
    status: "customs_clearance",
    description: "Construction Materials",
    client: "Liberia Construction Co.",
    origin: {
      country: "China",
      port: "Port of Shanghai"
    },
    destination: {
      country: "Liberia", 
      port: "Freeport of Monrovia"
    },
    timeline: [
      {
        status: "customs_clearance",
        description: "Customs processing at Freeport of Monrovia",
        location: "Monrovia, Liberia",
        timestamp: new Date().toISOString()
      },
      {
        status: "arrived",
        description: "Vessel arrived at port",
        location: "Freeport of Monrovia",
        timestamp: new Date(Date.now() - 86400000).toISOString()
      },
      {
        status: "in_transit",
        description: "Departed origin port",
        location: "Port of Shanghai",
        timestamp: new Date(Date.now() - 604800000).toISOString()
      }
    ],
    estimatedArrival: new Date(Date.now() + 259200000).toISOString(), // 3 days from now
    carrier: "Maersk Line"
  };

  res.json({
    success: true,
    data: mockShipment
  });
});

// Mock Quote Calculator
app.post('/api/quotes/calculate', (req, res) => {
  const { serviceType, origin, cargoType, weight, volume, value, description } = req.body;

  // Input validation
  if (!serviceType || !origin || !cargoType || !weight || !volume) {
    return res.status(400).json({
      success: false,
      message: 'Please provide all required fields: serviceType, origin, cargoType, weight, volume'
    });
  }

  // Calculation logic
  const serviceMultipliers = {
    'clearing': 1,
    'sea_freight': 2.5,
    'air_freight': 4,
    'full_logistics': 3
  };
  
  const cargoMultipliers = {
    'general': 1,
    'construction': 1.2,
    'vehicles': 1.5,
    'perishable': 1.8,
    'hazardous': 2.2
  };

  const baseCost = (serviceMultipliers[serviceType] || 1) * 500;
  const weightCost = parseFloat(weight) * 2.5;
  const volumeCost = parseFloat(volume) * 150;
  const cargoMultiplier = cargoMultipliers[cargoType] || 1;
  
  const calculatedAmount = (baseCost + weightCost + volumeCost) * cargoMultiplier;

  res.json({
    success: true,
    data: {
      calculatedAmount: calculatedAmount.toFixed(2),
      currency: "USD",
      quoteId: `QUOTE-${Date.now()}`,
      breakdown: {
        baseFee: baseCost,
        weightCharge: weightCost,
        volumeCharge: volumeCost,
        cargoSurcharge: cargoMultiplier
      },
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    }
  });
});

// Mock Detailed Quote Request
app.post('/api/quotes/request-detailed', (req, res) => {
  const { quoteId, companyName, email, phone, additionalNotes } = req.body;

  if (!quoteId || !companyName || !email || !phone) {
    return res.status(400).json({
      success: false,
      message: 'Please provide quoteId, companyName, email, and phone'
    });
  }

  res.json({
    success: true,
    message: 'Detailed quote request submitted successfully! Our team will contact you within 2 hours.',
    data: {
      quoteId,
      companyName,
      email,
      phone,
      submittedAt: new Date().toISOString(),
      reference: `REF-${Date.now()}`
    }
  });
});

// Mock Client Registration
app.post('/api/auth/register', (req, res) => {
  const { companyName, email, phone, password, contactPerson } = req.body;

  if (!companyName || !email || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide companyName, email, phone, and password'
    });
  }

  res.json({
    success: true,
    message: 'Registration successful!',
    user: {
      id: `USER-${Date.now()}`,
      companyName,
      email,
      phone,
      contactPerson,
      role: 'client'
    },
    token: 'mock_jwt_token_here'
  });
});

// Mock Client Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }

  // Mock authentication - in real app, check against database
  res.json({
    success: true,
    message: 'Login successful!',
    user: {
      id: 'USER-12345',
      companyName: 'Demo Construction Company',
      email: email,
      phone: '+231-XX-XXX-XXXX',
      role: 'client'
    },
    token: 'mock_jwt_token_here'
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('✅ Liberia Clearing & Forwarding API Server Started!');
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀 API is ready to use!`);
  console.log('');
  console.log('📋 Available Endpoints:');
  console.log('   GET  /                            - API status');
  console.log('   GET  /health                      - Health check');
  console.log('   GET  /api/shipments/track/:id     - Track shipment');
  console.log('   POST /api/quotes/calculate        - Get instant quote');
  console.log('   POST /api/quotes/request-detailed - Request detailed quote');
  console.log('   POST /api/auth/register           - Client registration');
  console.log('   POST /api/auth/login              - Client login');
});