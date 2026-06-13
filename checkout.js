const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ╔══════════════════════════════════════════════════════════════╗
// ║  TAMREEDCO — Stripe Checkout API                            ║
// ║  File: api/checkout.js                                      ║
// ║  Host on Vercel — set STRIPE_SECRET_KEY in env variables    ║
// ╚══════════════════════════════════════════════════════════════╝

// ── STEP 1: Replace these Price IDs with yours from Stripe ──
// stripe.com → Products → click each product → copy "Price ID"
const PRICE_IDS = {
  starter:      'price_REPLACE_WITH_STARTER_PRICE_ID',
  professional: 'price_REPLACE_WITH_PROFESSIONAL_PRICE_ID',
  enterprise:   'price_REPLACE_WITH_ENTERPRISE_PRICE_ID',
  unlimited:    'price_REPLACE_WITH_UNLIMITED_PRICE_ID',
};

// ── STEP 2: Set your domain in Vercel env variables ──
const DOMAIN = process.env.DOMAIN || 'https://tamreedco.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { plan, hospital_name, email, employer_id } = req.body;

    if (!PRICE_IDS[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      customer_email: email || undefined,
      metadata: {
        plan, hospital_name: hospital_name || '', employer_id: employer_id || '', tamreedco: 'true',
      },
      subscription_data: {
        metadata: { plan, hospital_name: hospital_name || '', employer_id: employer_id || '' },
      },
      success_url: `${DOMAIN}/?subscribed=true&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${DOMAIN}/?cancelled=true`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
