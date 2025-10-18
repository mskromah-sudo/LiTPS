import express from 'express';
import {
  dailyReconciliation,
  sendOverdueReminders,
  getMonthlyRevenueReport,
  exportPaymentsToCSV,
  getPaymentAnalytics
} from '../controllers/paymentReconciliation.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

router.post('/reconcile', dailyReconciliation);
router.post('/send-reminders', sendOverdueReminders);
router.get('/reports/monthly', getMonthlyRevenueReport);
router.get('/export', exportPaymentsToCSV);
router.get('/analytics', getPaymentAnalytics);

export default router;