const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ╔══════════════════════════════════════════════════════════════╗
// ║  TAMREEDCO — Stripe Webhook Handler                         ║
// ║  File: api/webhook.js                                       ║
// ║                                                             ║
// ║  In Stripe dashboard:                                       ║
// ║  Developers → Webhooks → Add endpoint                       ║
// ║  URL: https://yourdomain.com/api/webhook                    ║
// ║  Events: checkout.session.completed,                        ║
// ║           customer.subscription.deleted,                    ║
// ║           invoice.payment_failed                            ║
// ║                                                             ║
// ║  Set STRIPE_WEBHOOK_SECRET in Vercel env variables          ║
// ╚══════════════════════════════════════════════════════════════╝

// CV allowances per plan
const PLAN_CVS = {
  starter:      10,
  professional: 30,
  enterprise:   50,
  unlimited:    999,
};

// Supabase client
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // use service role key here (server-side only)
);

// Vercel needs raw body for Stripe signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Stripe event received:', event.type);

  switch (event.type) {

    // ── Payment successful → activate subscription ──
    case 'checkout.session.completed': {
      const session    = event.data.object;
      const employerId = session.metadata?.employer_id;
      const plan       = session.metadata?.plan;
      const cvs        = PLAN_CVS[plan] || 0;

      if (employerId && plan) {
        const { error } = await supabase
          .from('employers')
          .update({
            subscription_plan:       plan,
            cvs_monthly:             cvs,
            cvs_used_this_month:     0,
            subscription_active:     true,
            stripe_customer_id:      session.customer,
            stripe_subscription_id:  session.subscription,
            subscription_start:      new Date().toISOString(),
          })
          .eq('id', employerId);

        if (error) console.error('Supabase update error:', error);
        else console.log(`Activated ${plan} for employer ${employerId}`);
      }
      break;
    }

    // ── Subscription cancelled → deactivate ──
    case 'customer.subscription.deleted': {
      const sub        = event.data.object;
      const customerId = sub.customer;

      const { error } = await supabase
        .from('employers')
        .update({
          subscription_plan:      null,
          cvs_monthly:            0,
          subscription_active:    false,
          stripe_subscription_id: null,
        })
        .eq('stripe_customer_id', customerId);

      if (error) console.error('Supabase deactivate error:', error);
      else console.log(`Deactivated subscription for customer ${customerId}`);
      break;
    }

    // ── Payment failed → notify ──
    case 'invoice.payment_failed': {
      const invoice    = event.data.object;
      const customerId = invoice.customer;
      console.log(`Payment failed for customer ${customerId}`);
      // Optional: send email notification via Resend/Brevo
      break;
    }

    // ── Subscription renewed → reset monthly CVs ──
    case 'invoice.payment_succeeded': {
      const invoice    = event.data.object;
      const customerId = invoice.customer;

      // Reset CV usage at start of each billing period
      if (invoice.billing_reason === 'subscription_cycle') {
        const { data: employer } = await supabase
          .from('employers')
          .select('subscription_plan')
          .eq('stripe_customer_id', customerId)
          .single();

        if (employer) {
          await supabase
            .from('employers')
            .update({ cvs_used_this_month: 0 })
            .eq('stripe_customer_id', customerId);
          console.log(`Monthly CVs reset for customer ${customerId}`);
        }
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
};
