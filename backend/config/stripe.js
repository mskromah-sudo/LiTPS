import Stripe from 'stripe';

let stripe;

// Check if it's a real Stripe key (starts with sk_test_ or sk_live_)
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
    });
    console.log('Stripe initialized with real API key');
} else {
    console.warn('STRIPE_SECRET_KEY not set or invalid - using mock Stripe instance');
    // Mock Stripe instance for development
    stripe = {
        paymentIntents: {
            create: () => Promise.resolve({ 
                id: 'mock_pi_123', 
                status: 'succeeded',
                client_secret: 'mock_client_secret_123'
            })
        },
        // Add other methods you might use
        customers: {
            create: () => Promise.resolve({ id: 'mock_cus_123' })
        }
    };
}

export default stripe;