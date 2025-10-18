import mongoose from 'mongoose';

const smsLogSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 160
  },
  templateType: {
    type: String,
    enum: [
      'SHIPMENT_BOOKED',
      'SHIPMENT_IN_TRANSIT', 
      'SHIPMENT_ARRIVED',
      'SHIPMENT_CLEARED',
      'SHIPMENT_DELIVERED',
      'PAYMENT_RECEIVED',
      'PAYMENT_OVERDUE',
      'PAYMENT_REMINDER',
      'QUOTE_READY',
      'URGENT_ACTION_REQUIRED',
      'DOCUMENT_REQUEST',
      'WELCOME_MESSAGE',
      'HELP_RESPONSE',
      'STATUS_HELP',
      'AGENT_RESPONSE',
      'CUSTOM'
    ]
  },
  gateway: {
    type: String,
    enum: ['hubtel', 'mnotify', 'africastalking'],
    required: true
  },
  gatewayId: String,
  status: {
    type: String,
    enum: ['sent', 'delivered', 'failed', 'pending'],
    default: 'sent'
  },
  cost: {
    type: Number,
    default: 0
  },
  isBulk: {
    type: Boolean,
    default: false
  },
  isFallback: {
    type: Boolean,
    default: false
  },
  isIncoming: {
    type: Boolean,
    default: false
  },
  incomingMessage: String, // For two-way SMS
  responseSent: Boolean, // For two-way SMS
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  error: String
}, {
  timestamps: true
});

// Index for efficient querying
smsLogSchema.index({ phoneNumber: 1, createdAt: -1 });
smsLogSchema.index({ gateway: 1, status: 1 });
smsLogSchema.index({ templateType: 1 });

export default mongoose.model('SMSLog', smsLogSchema);