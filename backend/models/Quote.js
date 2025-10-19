const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema({
  trackingNumber: {
    type: String,
    required: true,
    unique: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true
  },
  origin: {
    country: String,
    port: String,
    address: String
  },
  destination: {
    country: String,
    port: String,
    address: String
  },
  cargoDetails: {
    type: String,
    weight: Number,
    volume: Number,
    value: Number,
    containers: Number
  },
  carrier: {
    name: String,
    vessel: String,
    bookingReference: String
  },
  status: {
    type: String,
    enum: ['pending', 'booked', 'in_transit', 'arrived', 'customs_clearance', 'delivered', 'cancelled'],
    default: 'pending'
  },
  timeline: [{
    status: String,
    description: String,
    location: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  documents: [{
    name: String,
    fileUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  quotes: [{
    amount: Number,
    currency: {
      type: String,
      default: 'USD'
    },
    breakdown: {
      freight: Number,
      customs: Number,
      handling: Number,
      insurance: Number,
      other: Number
    },
    validUntil: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    }
  }],
  estimatedArrival: Date,
  actualArrival: Date,
  notes: String
}, {
  timestamps: true
});

// Generate tracking number before saving
shipmentSchema.pre('save', async function(next) {
  if (!this.trackingNumber) {
    const count = await mongoose.model('Shipment').countDocuments();
    this.trackingNumber = `LCL-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model('Quote', quoteSchema)