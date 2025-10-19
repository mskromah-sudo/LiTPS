import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
  // Add your actual schema fields here
  shipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
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
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected'],
    default: 'draft'
  },
  validUntil: Date,
  notes: String
}, {
  timestamps: true
});

export default mongoose.model('Quote', quoteSchema);