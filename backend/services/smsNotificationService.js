import SMSService, { smsTemplates } from './smsService.js';
import User from '../models/User.js';
import Shipment from '../models/Shipment.js';
import Payment from '../models/Payment.js';

// @desc    Send shipment status update SMS
export const sendShipmentUpdateSMS = async (shipmentId, newStatus) => {
  try {
    const shipment = await Shipment.findById(shipmentId).populate('client');
    
    if (!shipment || !shipment.client) {
      throw new Error('Shipment or client not found');
    }

    let message;
    
    switch (newStatus) {
      case 'booked':
        message = smsTemplates.SHIPMENT_BOOKED(shipment, shipment.client);
        break;
      case 'in_transit':
        message = smsTemplates.SHIPMENT_IN_TRANSIT(shipment, shipment.client);
        break;
      case 'arrived':
        message = smsTemplates.SHIPMENT_ARRIVED(shipment, shipment.client);
        break;
      case 'customs_clearance':
        message = smsTemplates.SHIPMENT_CLEARED(shipment, shipment.client);
        break;
      case 'delivered':
        message = smsTemplates.SHIPMENT_DELIVERED(shipment, shipment.client);
        break;
      default:
        message = `Update: Shipment ${shipment.trackingNumber} status changed to ${newStatus}.`;
    }

    const result = await SMSService.sendSMS(
      shipment.client.phone,
      message,
      `SHIPMENT_${newStatus.toUpperCase()}`,
      {
        shipmentId: shipment._id,
        trackingNumber: shipment.trackingNumber,
        status: newStatus
      }
    );

    return result;

  } catch (error) {
    console.error('Error sending shipment update SMS:', error);
    throw error;
  }
};

// @desc    Send payment notification SMS
export const sendPaymentSMS = async (paymentId, notificationType) => {
  try {
    const payment = await Payment.findById(paymentId).populate('client');
    
    if (!payment || !payment.client) {
      throw new Error('Payment or client not found');
    }

    let message;
    
    switch (notificationType) {
      case 'received':
        message = smsTemplates.PAYMENT_RECEIVED(payment, payment.client);
        break;
      case 'overdue':
        message = smsTemplates.PAYMENT_OVERDUE(payment, payment.client);
        break;
      case 'reminder':
        const daysUntilDue = Math.ceil((new Date(payment.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        message = smsTemplates.PAYMENT_REMINDER(payment, payment.client, daysUntilDue);
        break;
      default:
        message = `Payment update: Invoice ${payment.invoiceNumber} - $${payment.amount}`;
    }

    const result = await SMSService.sendSMS(
      payment.client.phone,
      message,
      `PAYMENT_${notificationType.toUpperCase()}`,
      {
        paymentId: payment._id,
        invoiceNumber: payment.invoiceNumber,
        amount: payment.amount
      }
    );

    return result;

  } catch (error) {
    console.error('Error sending payment SMS:', error);
    throw error;
  }
};

// @desc    Send urgent alert SMS
export const sendUrgentAlert = async (shipmentId, alertType, customMessage = null) => {
  try {
    const shipment = await Shipment.findById(shipmentId).populate('client');
    
    if (!shipment || !shipment.client) {
      throw new Error('Shipment or client not found');
    }

    let message;
    
    if (customMessage) {
      message = customMessage;
    } else {
      switch (alertType) {
        case 'document_required':
          message = smsTemplates.DOCUMENT_REQUEST(shipment, shipment.client, ['Additional documents']);
          break;
        case 'customs_issue':
          message = smsTemplates.URGENT_ACTION_REQUIRED(shipment, shipment.client, 'Customs clearance issue needs attention');
          break;
        case 'delivery_issue':
          message = smsTemplates.URGENT_ACTION_REQUIRED(shipment, shipment.client, 'Delivery issue needs resolution');
          break;
        default:
          message = smsTemplates.URGENT_ACTION_REQUIRED(shipment, shipment.client, 'Immediate attention required');
      }
    }

    // Send to client
    const clientResult = await SMSService.sendSMS(
      shipment.client.phone,
      message,
      `URGENT_${alertType.toUpperCase()}`,
      {
        shipmentId: shipment._id,
        trackingNumber: shipment.trackingNumber,
        alertType: alertType
      }
    );

    // Also notify operations team for urgent alerts
    const opsNumbers = process.env.OPS_PHONE_NUMBERS?.split(',') || [];
    const opsMessage = `URGENT: ${alertType} for shipment ${shipment.trackingNumber} (${shipment.client.companyName})`;
    
    for (const opsNumber of opsNumbers) {
      await SMSService.sendSMS(opsNumber, opsMessage, 'OPS_ALERT', {
        shipmentId: shipment._id,
        client: shipment.client.companyName,
        alertType: alertType
      });
    }

    return clientResult;

  } catch (error) {
    console.error('Error sending urgent alert SMS:', error);
    throw error;
  }
};

// @desc    Send bulk SMS to multiple clients
export const sendBulkNotification = async (clientIds, message, templateType = 'CUSTOM') => {
  try {
    const clients = await User.find({ _id: { $in: clientIds } });
    const phoneNumbers = clients.map(client => client.phone).filter(phone => phone);

    if (phoneNumbers.length === 0) {
      throw new Error('No valid phone numbers found for the selected clients');
    }

    const result = await SMSService.sendBulkSMS(
      phoneNumbers,
      message,
      templateType,
      {
        clientCount: clients.length,
        notificationType: 'bulk'
      }
    );

    return result;

  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    throw error;
  }
};

// @desc    Send quote ready notification
export const sendQuoteReadySMS = async (quoteId) => {
  try {
    const quote = await Quote.findById(quoteId).populate('client');
    
    if (!quote || !quote.client) {
      throw new Error('Quote or client not found');
    }

    const message = smsTemplates.QUOTE_READY(quote, quote.client);

    const result = await SMSService.sendSMS(
      quote.client.phone,
      message,
      'QUOTE_READY',
      {
        quoteId: quote._id,
        amount: quote.calculatedAmount
      }
    );

    return result;

  } catch (error) {
    console.error('Error sending quote ready SMS:', error);
    throw error;
  }
};