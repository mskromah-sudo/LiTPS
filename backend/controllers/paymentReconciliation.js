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
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        remindersSent,
        totalOverdue: overduePayments.length,
        errors
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Monthly revenue report
// @route   GET /api/payments/reports/monthly
// @access  Private/Admin
export const getMonthlyRevenueReport = async (req, res) => {
  try {
    const { year, month } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) || new Date().getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Get monthly payments
    const monthlyPayments = await Payment.aggregate([
      {
        $match: {
          paidAt: {
            $gte: startDate,
            $lte: endDate
          },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: '$paidAt' },
            paymentMethod: '$paymentMethod'
          },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.day': 1 }
      }
    ]);

    // Get daily breakdown
    const dailyBreakdown = await Payment.aggregate([
      {
        $match: {
          paidAt: {
            $gte: startDate,
            $lte: endDate
          },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: '$paidAt' }
          },
          totalAmount: { $sum: '$amount' },
          paymentCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.day': 1 }
      }
    ]);

    // Get payment method summary
    const paymentMethodSummary = await Payment.aggregate([
      {
        $match: {
          paidAt: {
            $gte: startDate,
            $lte: endDate
          },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          averageAmount: { $avg: '$amount' }
        }
      }
    ]);

    // Get top clients
    const topClients = await Payment.aggregate([
      {
        $match: {
          paidAt: {
            $gte: startDate,
            $lte: endDate
          },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$client',
          totalPaid: { $sum: '$amount' },
          paymentCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalPaid: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'clientInfo'
        }
      },
      {
        $unwind: '$clientInfo'
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: endDate,
          month: targetMonth,
          year: targetYear
        },
        summary: {
          totalRevenue: monthlyPayments.reduce((sum, day) => sum + day.totalAmount, 0),
          totalTransactions: monthlyPayments.reduce((sum, day) => sum + day.count, 0),
          averageTransaction: monthlyPayments.length > 0 ? 
            monthlyPayments.reduce((sum, day) => sum + day.totalAmount, 0) / 
            monthlyPayments.reduce((sum, day) => sum + day.count, 0) : 0
        },
        dailyBreakdown,
        paymentMethodSummary,
        topClients: topClients.map(client => ({
          companyName: client.clientInfo.companyName,
          totalPaid: client.totalPaid,
          paymentCount: client.paymentCount
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Export payments to CSV
// @route   GET /api/payments/export
// @access  Private/Admin
export const exportPaymentsToCSV = async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.query;

    const filter = {
      status: 'completed'
    };

    if (startDate && endDate) {
      filter.paidAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const payments = await Payment.find(filter)
      .populate('client', 'companyName email phone')
      .populate('shipment', 'trackingNumber')
      .sort({ paidAt: -1 });

    if (format === 'csv') {
      const csvData = convertPaymentsToCSV(payments);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=payments-${new Date().toISOString().split('T')[0]}.csv`);
      res.status(200).send(csvData);
    } else {
      res.status(200).json({
        success: true,
        data: payments
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Payment analytics dashboard
// @route   GET /api/payments/analytics
// @access  Private/Admin
export const getPaymentAnalytics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Revenue trends
    const revenueTrends = await Payment.aggregate([
      {
        $match: {
          paidAt: { $gte: thirtyDaysAgo },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$paidAt' },
            month: { $month: '$paidAt' },
            day: { $dayOfMonth: '$paidAt' }
          },
          dailyRevenue: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Payment method distribution
    const methodDistribution = await Payment.aggregate([
      {
        $match: {
          paidAt: { $gte: thirtyDaysAgo },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Success rate by payment method
    const successRates = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          totalAttempts: { $sum: 1 },
          successfulPayments: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          paymentMethod: '$_id',
          totalAttempts: 1,
          successfulPayments: 1,
          successRate: {
            $multiply: [
              { $divide: ['$successfulPayments', '$totalAttempts'] },
              100
            ]
          }
        }
      }
    ]);

    // Overdue payments summary
    const overdueSummary = await Payment.aggregate([
      {
        $match: {
          status: 'pending',
          dueDate: { $lt: new Date() }
        }
      },
      {
        $group: {
          _id: null,
          totalOverdueAmount: { $sum: '$amount' },
          overdueCount: { $sum: 1 },
          averageDaysOverdue: { $avg: '$daysOverdue' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        revenueTrends,
        methodDistribution,
        successRates,
        overdueSummary: overdueSummary[0] || {
          totalOverdueAmount: 0,
          overdueCount: 0,
          averageDaysOverdue: 0
        },
        summary: {
          totalRevenue: revenueTrends.reduce((sum, day) => sum + day.dailyRevenue, 0),
          totalTransactions: revenueTrends.reduce((sum, day) => sum + day.transactionCount, 0),
          period: {
            start: thirtyDaysAgo,
            end: new Date()
          }
        }
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
const sendReconciliationReport = async (summary, payments, failedPayments) => {
  const reportDate = new Date().toLocaleDateString();
  
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0056b3, #28a745); padding: 30px; text-align: center; color: white;">
        <h1>Daily Payment Reconciliation Report</h1>
        <h2>${reportDate}</h2>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <!-- Summary Section -->
        <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h3>Daily Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Total Payments:</strong></td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${summary.totalPayments}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Total Amount:</strong></td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">$${summary.totalAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Failed Payments:</strong></td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${summary.failedPayments}</td>
            </tr>
          </table>
        </div>

        <!-- Payment Methods Breakdown -->
        <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h3>Payment Methods</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${Object.entries(summary.paymentMethods).map(([method, amount]) => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-transform: capitalize;">${method}:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">$${amount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </table>
        </div>

        <!-- Recent Payments -->
        <div style="background: white; padding: 20px; border-radius: 10px;">
          <h3>Recent Payments (Last 5)</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f8f9fa;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0056b3;">Invoice</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0056b3;">Client</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0056b3;">Amount</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0056b3;">Method</th>
            </tr>
            ${payments.slice(0, 5).map(payment => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${payment.invoiceNumber}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${payment.client.companyName}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">$${payment.amount.toFixed(2)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-transform: capitalize;">${payment.paymentMethod}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    </div>
  `;

  await sendEmail({
    to: process.env.ADMIN_EMAIL || 'admin@liberiacclearlogistics.com',
    subject: `Payment Reconciliation Report - ${reportDate}`,
    html: emailHtml
  });
};

const sendOverdueReminder = async (payment) => {
  const daysOverdue = Math.floor((new Date() - new Date(payment.dueDate)) / (1000 * 60 * 60 * 24));
  
  await sendEmail({
    to: payment.client.email,
    subject: `Payment Reminder: Invoice ${payment.invoiceNumber} is Overdue`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ffc107, #fd7e14); padding: 30px; text-align: center; color: white;">
          <h1>Payment Reminder</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2>Dear ${payment.client.companyName},</h2>
          <p>This is a friendly reminder that your invoice <strong>${payment.invoiceNumber}</strong> is <strong>${daysOverdue} days overdue</strong>.</p>
          
          <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3>Invoice Details:</h3>
            <p><strong>Amount Due:</strong> $${payment.amount.toFixed(2)}</p>
            <p><strong>Due Date:</strong> ${new Date(payment.dueDate).toLocaleDateString()}</p>
            <p><strong>Days Overdue:</strong> ${daysOverdue}</p>
          </div>

          <p>Please make the payment as soon as possible to avoid any service interruptions.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.CLIENT_URL}/payments" 
               style="background: #0056b3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Pay Now
            </a>
          </div>

          <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
            If you've already made this payment, please disregard this reminder.
          </p>
        </div>
      </div>
    `
  });
};

const convertPaymentsToCSV = (payments) => {
  const headers = ['Invoice Number', 'Client', 'Amount', 'Currency', 'Payment Method', 'Status', 'Paid Date', 'Description'];
  
  const csvRows = [
    headers.join(','),
    ...payments.map(payment => [
      payment.invoiceNumber,
      `"${payment.client.companyName}"`,
      payment.amount,
      payment.currency,
      payment.paymentMethod,
      payment.status,
      payment.paidAt ? new Date(payment.paidAt).toISOString().split('T')[0] : '',
      `"${payment.description}"`
    ].join(','))
  ];

  return csvRows.join('\n');
};

export default {
  dailyReconciliation,
  sendOverdueReminders,
  getMonthlyRevenueReport,
  exportPaymentsToCSV,
  getPaymentAnalytics
};