import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config();

// Debug: Check if env vars are loading
console.log('MongoDB URI exists:', !!process.env.MONGODB_URI);
console.log('Environment:', process.env.NODE_ENV);

// ES6 module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import authRoutes from './backend/routes/auth.js';
import shipmentRoutes from './backend/routes/shipments.js';
import quoteRoutes from './backend/routes/quotes.js';
import adminRoutes from './backend/routes/admin.js';
import emailRoutes from './backend/routes/email.js';
import paymentRoutes from './backend/routes/payment.js';
import paymentReportRoutes from './backend/routes/paymentReports.js';
import smsRoutes from './backend/routes/sms.js';
import { initializeSMSSchedulers } from './backend/services/smsScheduler.js';

const app = express();

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment-reports', paymentReportRoutes);
app.use('/api/sms', smsRoutes);

// Home route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Liberia Clearing & Forwarding API is running...',
    version: '2.0.0',
    database: 'MongoDB Connected',
    timestamp: new Date().toISOString()
  });
});

// Health check with DB status
app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.json({
    success: true,
    message: 'API Health Check',
    database: dbStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Handle unhandled routes
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Database connection with retry logic
const connectDB = async () => {
  try {
    console.log('MongoDB URI: Loaded');
    
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    // Remove the options object entirely

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    
    return false;
  }
};

// Start the server
(async () => {
  const dbConnected = await connectDB();
  
  if (!dbConnected && process.env.NODE_ENV === 'production') {
    console.log('❌ Failed to connect to database. Exiting...');
    process.exit(1);
  }

  const PORT = process.env.PORT || 5000;
  
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 LiberiaClearLogistics Backend Started!');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Database: ${dbConnected ? 'Connected ✅' : 'Disconnected ❌'}`);
    console.log(`📱 SMS Service: ${process.env.SMS_ENABLED === 'true' ? 'Enabled ✅' : 'Disabled ❌'}`);
    console.log(`🕒 Started: ${new Date().toLocaleString()}`);
    console.log('='.repeat(50) + '\n');

    // Initialize SMS schedulers
    initializeSMSSchedulers();
  });
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});