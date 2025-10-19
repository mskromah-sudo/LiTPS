import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import Shipment from '../models/Shipment.js';
import Quote from '../models/Quote.js';
import {stripe} from '../config/stripe.js';
import { getPayPalAccessToken, paypalConfig } from '../config/paypal.js';
import { sendEmail, emailTemplates } from '../utils/emailService.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendPaymentSMS } from '../services/smsNotificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Create payment and invoice
// @route   POST /api/payments/create
// @access  Private
export const createPayment = async (req, res) => {
  try {
    const { shipmentId, quoteId, items, dueDate, notes } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment items are required'
      });
    }

    const client = await User.findById(req.user.id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxRate = 0.15; // 15% tax for Liberia
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    // Create payment record
    const payment = await Payment.create({
      client: req.user.id,
      shipment: shipmentId,
      quote: quoteId,
      amount: totalAmount,
      description: `Payment for ${shipmentId ? 'shipment' : 'quote'} services`,
      items: items,
      dueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      notes,
      paymentMethod: 'pending'
    });

    // Create invoice
    const invoice = await Invoice.create({
      payment: payment._id,
      client: req.user.id,
      dueDate: payment.dueDate,
      items: items,
      subtotal: subtotal,
      taxRate: taxRate * 100, // Convert to percentage
      taxAmount: taxAmount,
      totalAmount: totalAmount,
      notes: notes,
      status: 'draft'
    });

    // Generate PDF invoice
    const pdfUrl = await generateInvoicePDF(invoice, client);

    // Update invoice with PDF URL
    invoice.pdfUrl = pdfUrl;
    await invoice.save();

    // Send invoice email
    try {
      await sendInvoiceEmail(invoice, client, pdfUrl);
      invoice.status = 'sent';
      invoice.sentAt = new Date();
      await invoice.save();
    } catch (emailError) {
      console.log('Invoice email failed:', emailError);
    }

    res.status(201).json({
      success: true,
      data: {
        payment,
        invoice
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create Stripe payment intent
// @route   POST /api/payments/stripe/create-intent
// @access  Private
export const createStripePaymentIntent = async (req, res) => {
  try {
    const { paymentId } = req.body;

    const payment = await Payment.findById(paymentId).populate('client');
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Verify payment belongs to user
    if (payment.client._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this payment'
      });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(payment.amount * 100), // Convert to cents
      currency: payment.currency.toLowerCase(),
      metadata: {
        paymentId: payment._id.toString(),
        invoiceNumber: payment.invoiceNumber,
        clientId: payment.client._id.toString()
      },
      description: `Payment for ${payment.description}`,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Update payment with Stripe intent ID
    payment.paymentGatewayId = paymentIntent.id;
    payment.paymentMethod = 'stripe';
    payment.status = 'processing';
    await payment.save();

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create PayPal order
// @route   POST /api/payments/paypal/create-order
// @access  Private
export const createPayPalOrder = async (req, res) => {
  try {
    const { paymentId } = req.body;

    const payment = await Payment.findById(paymentId).populate('client');
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Verify payment belongs to user
    if (payment.client._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this payment'
      });
    }

    const accessToken = await getPayPalAccessToken();

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: payment.currency,
            value: payment.amount.toFixed(2)
          },
          description: payment.description,
          custom_id: payment._id.toString(),
          invoice_id: payment.invoiceNumber
        }
      ],
      application_context: {
        brand_name: 'LiberiaClearLogistics',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: `${process.env.CLIENT_URL}/payment/success`,
        cancel_url: `${process.env.CLIENT_URL}/payment/cancel`
      }
    };

    const response = await fetch(`${paypalConfig.apiUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderData)
    });

    const order = await response.json();

    if (order.error) {
      throw new Error(order.error_description);
    }

    // Update payment with PayPal order ID
    payment.paymentGatewayId = order.id;
    payment.paymentMethod = 'paypal';
    payment.status = 'processing';
    await payment.save();

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        approvalUrl: order.links.find(link => link.rel === 'approve').href
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Handle Stripe webhook
// @route   POST /api/payments/stripe/webhook
// @access  Public
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`❌ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.log('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// @desc    Capture PayPal payment
// @route   POST /api/payments/paypal/capture-order
// @access  Private
export const capturePayPalOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(
      `${paypalConfig.apiUrl}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    const captureData = await response.json();

    if (captureData.error) {
      throw new Error(captureData.error_description);
    }

    // Find payment by order ID
    const payment = await Payment.findOne({ paymentGatewayId: orderId }).populate('client');
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (captureData.status === 'COMPLETED') {
      // Update payment status
      payment.status = 'completed';
      payment.paidAt = new Date();
      payment.paymentDetails = captureData;
      await payment.save();

      // Update invoice status
      await Invoice.findOneAndUpdate(
        { payment: payment._id },
        { status: 'paid', paidAt: new Date() }
      );

      // Send receipt
      await sendPaymentReceipt(payment);

      res.status(200).json({
        success: true,
        data: {
          status: 'completed',
          payment
        }
      });
    } else {
      payment.status = 'failed';
      await payment.save();

      res.status(400).json({
        success: false,
        message: 'Payment capture failed'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get client payments
// @route   GET /api/payments
// @access  Private
export const getClientPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    let filter = { client: req.user.id };
    if (status) filter.status = status;

    const payments = await Payment.find(filter)
      .populate('shipment', 'trackingNumber description')
      .populate('quote', 'serviceType calculatedAmount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get payment by ID
// @route   GET /api/payments/:id
// @access  Private
export const getPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('client', 'companyName email phone')
      .populate('shipment', 'trackingNumber description')
      .populate('quote', 'serviceType calculatedAmount');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (payment.client._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this payment'
      });
    }

    const invoice = await Invoice.findOne({ payment: payment._id });

    res.status(200).json({
      success: true,
      data: {
        payment,
        invoice
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper Functions
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  const payment = await Payment.findOne({ paymentGatewayId: paymentIntent.id }).populate('client');
  if (payment) {
    payment.status = 'completed';
    payment.paidAt = new Date();
    payment.paymentDetails = paymentIntent;
    await payment.save();

    // Update invoice
    await Invoice.findOneAndUpdate(
      { payment: payment._id },
      { status: 'paid', paidAt: new Date() }
    );

    // Send receipt email
    await sendPaymentReceipt(payment);

    // Send SMS notification
    if (process.env.SMS_ENABLED === 'true') {
      try {
        await sendPaymentSMS(payment._id, 'received');
      } catch (smsError) {
        console.log('Payment SMS notification failed:', smsError);
      }
    }

    console.log(`✅ Payment ${payment.invoiceNumber} completed successfully`);
  }
};

const handlePaymentIntentFailed = async (paymentIntent) => {
  const payment = await Payment.findOne({ paymentGatewayId: paymentIntent.id });
  if (payment) {
    payment.status = 'failed';
    await payment.save();

    console.log(`❌ Payment ${payment.invoiceNumber} failed`);
  }
};

const generateInvoicePDF = async (invoice, client) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filename = `invoice-${invoice.invoiceNumber}.pdf`;
      const filepath = path.join(__dirname, '../public/invoices', filename);
      
      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).fillColor('#0056b3').text('LIBERIACLEARLOGISTICS', 50, 50);
      doc.fontSize(10).fillColor('#666').text('Professional Clearing & Forwarding Services', 50, 75);
      doc.fontSize(8).text('Freeport of Monrovia Area, Monrovia, Liberia', 50, 90);
      doc.text('Phone: +231-88-123-4567 | Email: info@liberiacclearlogistics.com', 50, 102);

      // Invoice title
      doc.fontSize(16).fillColor('#000').text('INVOICE', 400, 50);
      doc.fontSize(10).fillColor('#666').text(`Invoice #: ${invoice.invoiceNumber}`, 400, 70);
      doc.text(`Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, 400, 82);
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 400, 94);

      // Client info
      doc.fontSize(12).fillColor('#000').text('Bill To:', 50, 130);
      doc.fontSize(10).fillColor('#666').text(client.companyName, 50, 145);
      doc.text(client.contactPerson?.name || 'N/A', 50, 157);
      doc.text(client.email, 50, 169);
      doc.text(client.phone, 50, 181);

      // Items table
      let yPosition = 220;
      
      // Table header
      doc.fontSize(10).fillColor('#fff');
      doc.rect(50, yPosition, 500, 20).fill('#0056b3');
      doc.text('Description', 60, yPosition + 5);
      doc.text('Qty', 350, yPosition + 5);
      doc.text('Unit Price', 400, yPosition + 5);
      doc.text('Total', 470, yPosition + 5);
      
      yPosition += 20;

      // Table rows
      doc.fillColor('#000');
      invoice.items.forEach(item => {
        doc.text(item.description, 60, yPosition + 5, { width: 280 });
        doc.text(item.quantity.toString(), 350, yPosition + 5);
        doc.text(`$${item.unitPrice.toFixed(2)}`, 400, yPosition + 5);
        doc.text(`$${item.total.toFixed(2)}`, 470, yPosition + 5);
        yPosition += 20;
      });

      // Totals
      yPosition += 10;
      doc.text(`Subtotal: $${invoice.subtotal.toFixed(2)}`, 400, yPosition);
      yPosition += 15;
      doc.text(`Tax (${invoice.taxRate}%): $${invoice.taxAmount.toFixed(2)}`, 400, yPosition);
      yPosition += 15;
      doc.fontSize(12).fillColor('#0056b3').text(`Total: $${invoice.totalAmount.toFixed(2)}`, 400, yPosition);

      // Notes
      if (invoice.notes) {
        yPosition += 40;
        doc.fontSize(10).fillColor('#000').text('Notes:', 50, yPosition);
        doc.text(invoice.notes, 50, yPosition + 15, { width: 500 });
      }

      // Footer
      yPosition += 60;
      doc.fontSize(8).fillColor('#666').text('Thank you for your business!', 50, yPosition);
      doc.text('LiberiaClearLogistics - Your trusted partner in Liberia', 50, yPosition + 12);

      doc.end();

      stream.on('finish', () => {
        resolve(`/invoices/${filename}`);
      });

      stream.on('error', reject);

    } catch (error) {
      reject(error);
    }
  });
};

const sendInvoiceEmail = async (invoice, client, pdfUrl) => {
  const invoiceUrl = `${process.env.CLIENT_URL}${pdfUrl}`;
  
  await sendEmail({
    to: client.email,
    subject: `Invoice ${invoice.invoiceNumber} - LiberiaClearLogistics`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0056b3, #28a745); padding: 30px; text-align: center; color: white;">
          <h1>INVOICE</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2>Dear ${client.companyName},</h2>
          <p>Please find your invoice attached. The payment is due by <strong>${new Date(invoice.dueDate).toLocaleDateString()}</strong>.</p>
          
          <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3>Invoice Summary:</h3>
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Amount Due:</strong> $${invoice.totalAmount.toFixed(2)} ${invoice.currency}</p>
            <p><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${invoiceUrl}" 
               style="background: #0056b3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px;">
              Download Invoice
            </a>
            <a href="${process.env.CLIENT_URL}/payments" 
               style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px;">
              Pay Online
            </a>
          </div>

          <p style="margin-top: 30px;">If you have any questions about this invoice, please contact our accounts team.</p>
        </div>
      </div>
    `
  });
};

const sendPaymentReceipt = async (payment) => {
  const client = await User.findById(payment.client);
  const invoice = await Invoice.findOne({ payment: payment._id });

  await sendEmail({
    to: client.email,
    subject: `Payment Receipt - ${payment.invoiceNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #28a745, #0056b3); padding: 30px; text-align: center; color: white;">
          <h1>PAYMENT RECEIPT</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2>Thank you for your payment!</h2>
          <p>Your payment has been successfully processed.</p>
          
          <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3>Payment Details:</h3>
            <p><strong>Receipt Number:</strong> ${payment.invoiceNumber}</p>
            <p><strong>Amount Paid:</strong> $${payment.amount.toFixed(2)} ${payment.currency}</p>
            <p><strong>Payment Date:</strong> ${new Date(payment.paidAt).toLocaleDateString()}</p>
            <p><strong>Payment Method:</strong> ${payment.paymentMethod}</p>
            <p><strong>Description:</strong> ${payment.description}</p>
          </div>

          <p>This email serves as your receipt. Please keep it for your records.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.CLIENT_URL}/payments" 
               style="background: #0056b3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Payment History
            </a>
          </div>
        </div>
      </div>
    `
  });

  payment.receiptSent = true;
  await payment.save();
};