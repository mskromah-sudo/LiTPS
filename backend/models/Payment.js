import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment'
  },
  quote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quote'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  description: {
    type: String,
    required: true
  },
  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number
  }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'paypal', 'bank_transfer', 'cash', 'mobile_money'],
    required: true
  },
  paymentGatewayId: {
    type: String // Stripe payment intent ID or PayPal order ID
  },
  paymentDetails: {
    // Store gateway-specific response data
    type: mongoose.Schema.Types.Mixed
  },
  dueDate: {
    type: Date,
    required: true
  },
  paidAt: Date,
  receiptSent: {
    type: Boolean,
    default: false
  },
  notes: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Generate invoice number before saving
paymentSchema.pre('save', async function(next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Payment').countDocuments();
    const year = new Date().getFullYear();
    this.invoiceNumber = `INV-${year}-${(count + 1).toString().padStart(5, '0')}`;
  }
  next();
});

// Virtual for isOverdue
paymentSchema.virtual('isOverdue').get(function() {
  return this.status === 'pending' && new Date() > this.dueDate;
});

// Virtual for daysOverdue
paymentSchema.virtual('daysOverdue').get(function() {
  if (this.status !== 'pending' || !this.isOverdue) return 0;
  const today = new Date();
  const dueDate = new Date(this.dueDate);
  return Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
});

export default mongoose.model('Payment', paymentSchema);