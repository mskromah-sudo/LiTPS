import cron from 'node-cron';
import Payment from '../models/Payment.js';
import { sendPaymentSMS } from './smsNotificationService.js';
import SMSService from './smsService.js';

// @desc    Schedule daily payment reminders
export const schedulePaymentReminders = () => {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('🔄 Running daily payment reminder SMS...');
      
      const today = new Date();
      const threeDaysFromNow = new Date(today);
      threeDaysFromNow.setDate(today.getDate() + 3);

      // Find payments due in 3 days
      const upcomingPayments = await Payment.find({
        status: 'pending',
        dueDate: {
          $gte: today,
          $lte: threeDaysFromNow
        }
      }).populate('client');

      let sentCount = 0;
      let errorCount = 0;

      for (const payment of upcomingPayments) {
        try {
          await sendPaymentSMS(payment._id, 'reminder');
          sentCount++;
        } catch (error) {
          console.error(`Failed to send reminder for payment ${payment.invoiceNumber}:`, error);
          errorCount++;
        }
      }

      console.log(`✅ Payment reminders sent: ${sentCount}, Errors: ${errorCount}`);

    } catch (error) {
      console.error('Error in payment reminder scheduler:', error);
    }
  });

  // Run every Monday at 10:00 AM for overdue payments
  cron.schedule('0 10 * * 1', async () => {
    try {
      console.log('🔄 Running weekly overdue payment SMS...');
      
      const overduePayments = await Payment.find({
        status: 'pending',
        dueDate: { $lt: new Date() }
      }).populate('client');

      let sentCount = 0;
      let errorCount = 0;

      for (const payment of overduePayments) {
        try {
          await sendPaymentSMS(payment._id, 'overdue');
          sentCount++;
        } catch (error) {
          console.error(`Failed to send overdue notice for payment ${payment.invoiceNumber}:`, error);
          errorCount++;
        }
      }

      console.log(`✅ Overdue payment notices sent: ${sentCount}, Errors: ${errorCount}`);

    } catch (error) {
      console.error('Error in overdue payment scheduler:', error);
    }
  });
};

// @desc    Schedule SMS balance check
export const scheduleBalanceCheck = () => {
  // Run every Monday at 8:00 AM
  cron.schedule('0 8 * * 1', async () => {
    try {
      console.log('🔄 Checking SMS balance...');
      
      const balance = await SMSService.getBalance();
      
      if (balance.success) {
        console.log(`📊 SMS Balance: ${balance.balance} ${balance.currency}`);
        
        // Send low balance alert to admins if balance is low
        if (balance.balance < 10) { // Adjust threshold as needed
          const adminNumbers = process.env.ADMIN_PHONE_NUMBERS?.split(',') || [];
          const alertMessage = `⚠️ LOW SMS BALANCE: ${balance.balance} ${balance.currency}. Please top up immediately.`;
          
          for (const adminNumber of adminNumbers) {
            await SMSService.sendSMS(adminNumber, alertMessage, 'BALANCE_ALERT');
          }
        }
      }

    } catch (error) {
      console.error('Error checking SMS balance:', error);
    }
  });
};

// @desc    Initialize all SMS schedulers
export const initializeSMSSchedulers = () => {
  if (process.env.SMS_ENABLED === 'true') {
    schedulePaymentReminders();
    scheduleBalanceCheck();
    console.log('✅ SMS schedulers initialized');
  } else {
    console.log('ℹ️ SMS schedulers disabled (SMS_ENABLED=false)');
  }
};