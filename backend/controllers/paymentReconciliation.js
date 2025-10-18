import Payment from '../models/Payment.js';
import { sendEmail } from '../utils/emailService.js';

// @desc    Daily payment reconciliation
// @route   POST /api/payments/reconcile
// @access  Private/Admin
export const dailyReconciliation = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Get payments for today
    const todaysPayments = await Payment.find({
      paidAt: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: 'completed'
    }).populate('client');

    // Calculate daily totals
    const dailySummary = {
      date: startOfDay,
      totalPayments: todaysPayments.length,
      totalAmount: todaysPayments.reduce((sum, payment) => sum + payment.amount, 0),
      paymentMethods: {},
      failedPayments: 0
    };

    // Group by payment method
    todaysPayments.forEach(payment => {
      if (!dailySummary.paymentMethods[payment.paymentMethod]) {
        dailySummary.paymentMethods[payment.paymentMethod] = 0;
      }
      dailySummary.paymentMethods[payment.paymentMethod] += payment.amount;
    });

    // Get failed payments
    const failedPayments = await Payment.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: 'failed'
    }).populate('client');

    dailySummary.failedPayments = failedPayments.length;

    // Send reconciliation report
    await sendReconciliationReport(dailySummary, todaysPayments, failedPayments);

    res.status(200).json({
      success: true,
      data: dailySummary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Send overdue payment reminders
// @route   POST /api/payments/send-reminders
// @access  Private/Admin
export const sendOverdueReminders = async (req, res) => {
  try {
    const overduePayments = await Payment.find({
      status: 'pending',
      dueDate: { $lt: new Date() }
    }).populate('client');

    let remindersSent = 0;
    let errors = [];

    for (const payment of overduePayments) {
      try {
        await sendOverdueReminder(payment);
        remindersSent++;
      } catch (error) {
        errors.push({
          payment: payment.invoiceNumber,
          error: error.message
       