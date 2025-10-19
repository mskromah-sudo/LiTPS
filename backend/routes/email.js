import express from 'express';
const router = express.Router();

// Simple test route
router.post('/', (req, res) => {
  res.json({
    success: true,
    message: 'Email route working successfully (placeholder)',
  });
});

export default router;
