import SMSLog from '../models/SMSLog.js';
import Shipment from '../models/Shipment.js';
import User from '../models/User.js';
import SMSService, { smsTemplates } from '../services/smsService.js';

// @desc    Handle incoming SMS (webhook)
// @route   POST /api/sms/incoming
// @access  Public (webhook)
export const handleIncomingSMS = async (req, res) => {
  try {
    const { from, message, gateway } = req.body;

    console.log(`📱 Incoming SMS from ${from}: ${message}`);

    // Log incoming message
    const smsLog = await SMSLog.create({
      phoneNumber: from,
      message: message,
      gateway: gateway || 'unknown',
      status: 'delivered',
      isIncoming: true,
      metadata: req.body
    });

    // Process the message and generate response
    const response = await processIncomingMessage(from, message);

    if (response) {
      // Send automated response
      await SMSService.sendSMS(from, response, 'AUTO_RESPONSE', {
        originalMessage: message,
        incomingSmsId: smsLog._id
      });

      // Update log with response info
      smsLog.responseSent = true;
      await smsLog.save();
    }

    res.status(200).json({ success: true, processed: true });

  } catch (error) {
    console.error('Error processing incoming SMS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Process incoming message and generate response
const processIncomingMessage = async (phoneNumber, message) => {
  const cleanMessage = message.trim().toUpperCase();
  
  // Help command
  if (cleanMessage.includes('HELP') || cleanMessage === '?') {
    return smsTemplates.HELP_RESPONSE();
  }

  // Status check command
  if (cleanMessage.startsWith('STATUS')) {
    return await handleStatusCheck(phoneNumber, cleanMessage);
  }

  // Billing/Payment info
  if (cleanMessage.includes('BILLING') || cleanMessage.includes('PAYMENT')) {
    return `For billing inquiries, call our accounts team at +231-88-123-4567 or email accounts@liberiacclearlogistics.com`;
  }

  // Agent request
  if (cleanMessage.includes('AGENT') || cleanMessage.includes('REPRESENTATIVE')) {
    await notifyAgentRequest(phoneNumber);
    return smsTemplates.AGENT_RESPONSE();
  }

  // Welcome message for new conversations
  if (cleanMessage.includes('HI') || cleanMessage.includes('HELLO') || cleanMessage === 'START') {
    // Try to find user by phone number
    const user = await User.findOne({ phone: phoneNumber });
    if (user) {
      return `Welcome back ${user.companyName}! ${smsTemplates.HELP_RESPONSE()}`;
    }
    return smsTemplates.WELCOME_MESSAGE();
  }

  // Default response for unrecognized messages
  return `Thank you for your message. For better assistance, please call +231-88-123-4567 or reply with: HELP for options, STATUS [tracking#] for shipment updates.`;
};

// @desc    Handle status check requests
const handleStatusCheck = async (phoneNumber, message) => {
  // Extract tracking number from message
  const trackingMatch = message.match(/STATUS\s+([A-Z0-9\-]+)/i);
  
  if (!trackingMatch) {
    return smsTemplates.STATUS_HELP();
  }

  const trackingNumber = trackingMatch[1].toUpperCase();
  
  try {
    // Find shipment by tracking number
    const shipment = await Shipment.findOne({ 
      trackingNumber: trackingNumber 
    }).populate('client', 'companyName phone');

    if (!shipment) {
      return `No shipment found with tracking number: ${trackingNumber}. Please check the number and try again.`;
    }

    // Verify the phone number matches the client's number
    if (shipment.client.phone !== phoneNumber) {
      return `Shipment ${trackingNumber} found, but phone number doesn't match our records. Please contact customer service.`;
    }

    // Return shipment status
    const statusMap = {
      'pending': 'Booking in progress',
      'booked': 'Booked and awaiting departure',
      'in_transit': 'In transit to Liberia',
      'arrived': 'Arrived at port',
      'customs_clearance': 'Customs clearance in progress',
      'delivered': 'Delivered successfully',
      'cancelled': 'Cancelled'
    };

    const statusText = statusMap[shipment.status] || shipment.status;
    const eta = shipment.estimatedArrival ? 
      new Date(shipment.estimatedArrival).toLocaleDateString() : 'To be confirmed';

    return `Shipment ${trackingNumber}: ${statusText}. ETA: ${eta}. For details: ${process.env.CLIENT_URL}/tracking`;

  } catch (error) {
    console.error('Error checking shipment status:', error);
    return 'Sorry, we encountered an error checking your shipment status. Please try again later or call us.';
  }
};

// @desc    Notify agents of incoming request
const notifyAgentRequest = async (phoneNumber) => {
  try {
    const user = await User.findOne({ phone: phoneNumber });
    const companyName = user ? user.companyName : 'Unknown';
    
    const agentNotification = `New SMS agent request from ${companyName} (${phoneNumber}). Please contact them promptly.`;
    
    // Send to multiple agents (you can define agent numbers in environment variables)
    const agentNumbers = process.env.AGENT_PHONE_NUMBERS?.split(',') || [];
    
    for (const agentNumber of agentNumbers) {
      await SMSService.sendSMS(agentNumber, agentNotification, 'AGENT_NOTIFICATION', {
        requester: phoneNumber,
        companyName: companyName
      });
    }

  } catch (error) {
    console.error('Error notifying agents:', error);
  }
};

// @desc    Get SMS conversation history
// @route   GET /api/sms/conversations/:phoneNumber
// @access  Private
export const getConversationHistory = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { limit = 50 } = req.query;

    const messages = await SMSLog.find({
      phoneNumber: phoneNumber
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: messages.reverse() // Return in chronological order
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};