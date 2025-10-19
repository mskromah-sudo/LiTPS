import express from 'express';
import {
  createPayment,
  createStripePaymentIntent,
  createPayPalOrder,
  handleStripeWebhook,
  capturePayPalOrder,
  getClientPayments,
  getPayment
} from '../controllers/paymentController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Webhook route (must be before body parser)
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// All other routes use JSON parser
router.use(express.json());

// Client routes
router.use(protect);

router.post('/create', createPayment);
router.post('/stripe/create-intent', createStripePaymentIntent);
router.post('/paypal/create-order', createPayPalOrder);
router.post('/paypal/capture-order', capturePayPalOrder);
router.get('/', getClientPayments);
router.get('/:id', getPayment);

// Admin routes for payment management
router.get('/admin/all', authorize('admin'), async (req, res) => {
  // Admin payment management logic here
});

export default router;