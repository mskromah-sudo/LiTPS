import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config();

// ES6 module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import authRoutes from './routes/auth.js';
import shipmentRoutes from './routes/shipments.js';
import quoteRoutes from './routes/quotes.js';
import adminRoutes from './routes/admin.js';
import emailRoutes from './routes/email.js';
import paymentRoutes from './routes/payments.js';
import paymentReportRoutes from './routes/paymentReports.js';
import smsRoutes from './routes/sms.js';
import { initializeSMSSchedulers } from './services/smsScheduler.js';

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

// Initialize SMS schedulers after server starts
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
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    // Create indexes for better performance
    await mongoose.connection.collection('shipments').createIndex({ trackingNumber: 1 }, { unique: true });
    await mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.collection('quotes').createIndex({ createdAt: -1 });
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    if (process.env.NODE_ENV === 'production') {
      // In production, exit if DB connection fails
      process.exit(1);
    }
    
    return false;
  }
};

// Connect to MongoDB and start server
const startServer = async () => {
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
    console.log(`🕒 Started: ${new Date().toLocaleString()}`);
    console.log('='.repeat(50) + '\n');
  });
};

// Start the server
startServer();

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