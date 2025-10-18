import axios from 'axios';
import { hubtelConfig, mNotifyConfig, africasTalkingConfig } from '../config/smsGateways.js';
import SMSLog from '../models/SMSLog.js';

// SMS Templates for different scenarios
export const smsTemplates = {
  // Shipment Updates
  SHIPMENT_BOOKED: (shipment, client) => 
    `Dear ${client.companyName}, your shipment ${shipment.trackingNumber} has been booked. Track: ${process.env.CLIENT_URL}/tracking`,

  SHIPMENT_IN_TRANSIT: (shipment, client) =>
    `Update: Shipment ${shipment.trackingNumber} is in transit from ${shipment.origin.port}. ETA: ${new Date(shipment.estimatedArrival).toLocaleDateString()}`,

  SHIPMENT_ARRIVED: (shipment, client) =>
    `Good news! Shipment ${shipment.trackingNumber} has arrived at ${shipment.destination.port}. Customs clearance in progress.`,

  SHIPMENT_CLEARED: (shipment, client) =>
    `Update: Shipment ${shipment.trackingNumber} cleared customs. Ready for delivery/delivery scheduled.`,

  SHIPMENT_DELIVERED: (shipment, client) =>
    `Success! Shipment ${shipment.trackingNumber} has been delivered. Thank you for choosing LiberiaClearLogistics!`,

  // Payment Notifications
  PAYMENT_RECEIVED: (payment, client) =>
    `Payment confirmed! We received $${payment.amount} for invoice ${payment.invoiceNumber}. Thank you!`,

  PAYMENT_OVERDUE: (payment, client) =>
    `Reminder: Invoice ${payment.invoiceNumber} for $${payment.amount} is overdue. Please settle to avoid service disruption.`,

  PAYMENT_REMINDER: (payment, client, daysUntilDue) =>
    `Friendly reminder: Invoice ${payment.invoiceNumber} for $${payment.amount} is due in ${daysUntilDue} days.`,

  // Quote Responses
  QUOTE_READY: (quote, client) =>
    `Your quote #${quote._id} is ready! Amount: $${quote.calculatedAmount}. Check your email for details or call us.`,

  // Urgent Alerts
  URGENT_ACTION_REQUIRED: (shipment, client, action) =>
    `URGENT: Action required for shipment ${shipment.trackingNumber}. ${action} Please contact us immediately.`,

  DOCUMENT_REQUEST: (shipment, client, documents) =>
    `Required for clearance: ${documents.join(', ')} for shipment ${shipment.trackingNumber}. Please provide ASAP.`,

  // Two-way SMS Responses
  WELCOME_MESSAGE: (client) =>
    `Welcome to LiberiaClearLogistics! Reply HELP for assistance, STATUS for shipment updates, or call +231-88-123-4567.`,

  HELP_RESPONSE: () =>
    `Available commands: STATUS [tracking#] - Check shipment, BILLING - Payment info, AGENT - Speak to representative.`,

  STATUS_HELP: () =>
    `To check status, reply: STATUS followed by your tracking number (e.g., STATUS LCL-2024-001)`,

  AGENT_RESPONSE: () =>
    `An agent will contact you shortly. For immediate assistance, call +231-88-123-4567. Thank you!`
};

// Main SMS Service Class
class SMSService {
  constructor() {
    this.preferredGateway = process.env.SMS_GATEWAY || 'hubtel';
  }

  // Send single SMS
  async sendSMS(phoneNumber, message, templateType = null, metadata = {}) {
    try {
      // Format Liberian phone number
      const formattedNumber = this.formatLiberianNumber(phoneNumber);
      
      if (!formattedNumber) {
        throw new Error(`Invalid Liberian phone number: ${phoneNumber}`);
      }

      // Truncate message if too long (SMS character limit)
      const truncatedMessage = message.length > 160 ? message.substring(0, 157) + '...' : message;

      let result;
      
      // Try preferred gateway first, fallback to others
      switch (this.preferredGateway) {
        case 'hubtel':
          result = await this.sendViaHubtel(formattedNumber, truncatedMessage);
          break;
        case 'mnotify':
          result = await this.sendViaMNotify(formattedNumber, truncatedMessage);
          break;
        case 'africastalking':
          result = await this.sendViaAfricasTalking(formattedNumber, truncatedMessage);
          break;
        default:
          result = await this.sendViaHubtel(formattedNumber, truncatedMessage);
      }

      // Log the SMS
      await SMSLog.create({
        phoneNumber: formattedNumber,
        message: truncatedMessage,
        templateType,
        gateway: this.preferredGateway,
        gatewayId: result.messageId,
        status: 'sent',
        cost: result.cost,
        metadata
      });

      console.log(`✅ SMS sent to ${formattedNumber}: ${truncatedMessage}`);
      return { success: true, messageId: result.messageId, cost: result.cost };

    } catch (error) {
      // Log failed attempt
      await SMSLog.create({
        phoneNumber: this.formatLiberianNumber(phoneNumber),
        message: message.substring(0, 160),
        templateType,
        gateway: this.preferredGateway,
        status: 'failed',
        error: error.message,
        metadata
      });

      console.error(`❌ SMS failed to ${phoneNumber}:`, error.message);
      
      // Try fallback gateway
      return await this.sendWithFallback(phoneNumber, message, templateType, metadata);
    }
  }

  // Send bulk SMS
  async sendBulkSMS(phoneNumbers, message, templateType = null, metadata = {}) {
    try {
      const formattedNumbers = phoneNumbers.map(num => this.formatLiberianNumber(num)).filter(Boolean);
      
      if (formattedNumbers.length === 0) {
        throw new Error('No valid Liberian phone numbers provided');
      }

      let results;

      switch (this.preferredGateway) {
        case 'hubtel':
          results = await this.sendBulkViaHubtel(formattedNumbers, message);
          break;
        case 'mnotify':
          results = await this.sendBulkViaMNotify(formattedNumbers, message);
          break;
        default:
          results = await this.sendBulkViaHubtel(formattedNumbers, message);
      }

      // Log bulk SMS
      for (const [index, number] of formattedNumbers.entries()) {
        await SMSLog.create({
          phoneNumber: number,
          message: message.substring(0, 160),
          templateType,
          gateway: this.preferredGateway,
          gatewayId: results.messageIds?.[index],
          status: 'sent',
          cost: results.cost / formattedNumbers.length, // Approximate cost per message
          isBulk: true,
          metadata
        });
      }

      console.log(`✅ Bulk SMS sent to ${formattedNumbers.length} numbers`);
      return { success: true, sentCount: formattedNumbers.length, cost: results.cost };

    } catch (error) {
      console.error('❌ Bulk SMS failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Fallback SMS sending
  async sendWithFallback(phoneNumber, message, templateType, metadata) {
    const fallbackGateways = ['mnotify', 'africastalking', 'hubtel'].filter(g => g !== this.preferredGateway);
    
    for (const gateway of fallbackGateways) {
      try {
        const formattedNumber = this.formatLiberianNumber(phoneNumber);
        const truncatedMessage = message.length > 160 ? message.substring(0, 157) + '...' : message;

        let result;
        switch (gateway) {
          case 'mnotify':
            result = await this.sendViaMNotify(formattedNumber, truncatedMessage);
            break;
          case 'africastalking':
            result = await this.sendViaAfricasTalking(formattedNumber, truncatedMessage);
            break;
          case 'hubtel':
            result = await this.sendViaHubtel(formattedNumber, truncatedMessage);
            break;
        }

        await SMSLog.create({
          phoneNumber: formattedNumber,
          message: truncatedMessage,
          templateType,
          gateway: gateway,
          gatewayId: result.messageId,
          status: 'sent',
          cost: result.cost,
          isFallback: true,
          metadata
        });

        console.log(`✅ SMS sent via fallback (${gateway}) to ${formattedNumber}`);
        return { success: true, messageId: result.messageId, cost: result.cost, usedFallback: true };

      } catch (fallbackError) {
        console.error(`❌ Fallback SMS (${gateway}) failed:`, fallbackError.message);
        continue;
      }
    }

    throw new Error('All SMS gateways failed');
  }

  // Hubtel SMS Implementation
  async sendViaHubtel(phoneNumber, message) {
    const auth = Buffer.from(`${hubtelConfig.clientId}:${hubtelConfig.clientSecret}`).toString('base64');
    
    const response = await axios.post(
      `${hubtelConfig.baseUrl}/messages`,
      {
        From: hubtelConfig.senderId,
        To: phoneNumber,
        Content: message,
        RegisteredDelivery: true
      },
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      messageId: response.data.MessageId,
      cost: response.data.Rate || 0.05 // Default cost estimate
    };
  }

  async sendBulkViaHubtel(phoneNumbers, message) {
    const auth = Buffer.from(`${hubtelConfig.clientId}:${hubtelConfig.clientSecret}`).toString('base64');
    
    const responses = await Promise.all(
      phoneNumbers.map(number => 
        axios.post(
          `${hubtelConfig.baseUrl}/messages`,
          {
            From: hubtelConfig.senderId,
            To: number,
            Content: message,
            RegisteredDelivery: true
          },
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          }
        )
      )
    );

    return {
      messageIds: responses.map(r => r.data.MessageId),
      cost: responses.reduce((sum, r) => sum + (r.data.Rate || 0.05), 0)
    };
  }

  // mNotify SMS Implementation
  async sendViaMNotify(phoneNumber, message) {
    const response = await axios.post(
      `${mNotifyConfig.baseUrl}/sms/quick`,
      {
        recipient: [phoneNumber],
        sender: mNotifyConfig.senderId,
        message: message,
        is_schedule: false,
        schedule_date: ''
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mNotifyConfig.apiKey
        }
      }
    );

    return {
      messageId: response.data.message_id,
      cost: response.data.cost || 0.04 // Default cost estimate
    };
  }

  async sendBulkViaMNotify(phoneNumbers, message) {
    const response = await axios.post(
      `${mNotifyConfig.baseUrl}/sms/quick`,
      {
        recipient: phoneNumbers,
        sender: mNotifyConfig.senderId,
        message: message,
        is_schedule: false,
        schedule_date: ''
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mNotifyConfig.apiKey
        }
      }
    );

    return {
      messageIds: [response.data.message_id], // mNotify returns single ID for batch
      cost: response.data.cost || phoneNumbers.length * 0.04
    };
  }

  // Africa's Talking SMS Implementation
  async sendViaAfricasTalking(phoneNumber, message) {
    const response = await axios.post(
      `${africasTalkingConfig.baseUrl}/messaging`,
      {
        username: africasTalkingConfig.username,
        to: phoneNumber,
        message: message,
        from: africasTalkingConfig.senderId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'ApiKey': africasTalkingConfig.apiKey
        }
      }
    );

    return {
      messageId: response.data.SMSMessageData.Recipients[0].messageId,
      cost: response.data.SMSMessageData.Recipients[0].cost || 0.06
    };
  }

  // Format Liberian phone number to international format
  formatLiberianNumber(phoneNumber) {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle various Liberian number formats
    if (cleaned.startsWith('231')) {
      return `+${cleaned}`;
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
      return `+231${cleaned.substring(1)}`;
    } else if (cleaned.length === 9) {
      return `+231${cleaned}`;
    } else if (cleaned.length === 8) {
      return `+231${cleaned}`;
    } else {
      return null; // Invalid format
    }
  }

  // Validate Liberian phone number
  isValidLiberianNumber(phoneNumber) {
    const formatted = this.formatLiberianNumber(phoneNumber);
    return formatted !== null;
  }

  // Get SMS balance (if supported by gateway)
  async getBalance() {
    try {
      switch (this.preferredGateway) {
        case 'hubtel':
          return await this.getHubtelBalance();
        case 'mnotify':
          return await this.getMNotifyBalance();
        default:
          return { success: false, message: 'Balance check not supported for this gateway' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getHubtelBalance() {
    const auth = Buffer.from(`${hubtelConfig.clientId}:${hubtelConfig.clientSecret}`).toString('base64');
    
    const response = await axios.get(
      `${hubtelConfig.baseUrl}/account/balance`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    return {
      success: true,
      balance: response.data.Balance,
      currency: response.data.Currency
    };
  }

  async getMNotifyBalance() {
    const response = await axios.get(
      `${mNotifyConfig.baseUrl}/balance`,
      {
        headers: {
          'x-api-key': mNotifyConfig.apiKey
        }
      }
    );

    return {
      success: true,
      balance: response.data.balance,
      currency: 'GHS' // mNotify uses Ghana Cedis
    };
  }
}

export default new SMSService();