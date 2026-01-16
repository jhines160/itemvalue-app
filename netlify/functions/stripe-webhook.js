// netlify/functions/stripe-webhook.js

exports.handler = async (event) => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const CONVERTKIT_API_KEY = process.env.CONVERTKIT_API_KEY;

  // Import Stripe with secret key
  const stripe = require('stripe')(STRIPE_SECRET_KEY);

  // Verify webhook signature for security
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Handle the checkout.session.completed event
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_email || session.customer_details?.email;
    const productName = session.metadata?.product_name || 'Item Value Purchase';
    
    // Determine which tag to apply based on product
    let tagId;
    
    // Map product names to ConvertKit tag IDs
    const tagMap = {
      'Single Scan': process.env.CK_TAG_SINGLE_SCAN,
      'Starter Pack': process.env.CK_TAG_STARTER_PACK,
      'Declutter Challenge': process.env.CK_TAG_CHALLENGE,
      'Weekend Warrior': process.env.CK_TAG_WEEKEND,
      'Moving Master': process.env.CK_TAG_MOVING,
      'Estate Pro': process.env.CK_TAG_ESTATE
    };
    
    tagId = tagMap[productName] || process.env.CK_TAG_CUSTOMER;

    // Add subscriber to ConvertKit
    if (email && tagId) {
      try {
        const fetch = (await import('node-fetch')).default;
        
        const response = await fetch(`https://api.convertkit.com/v3/tags/${tagId}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: CONVERTKIT_API_KEY,
            email: email,
            fields: {
              purchase_date: new Date().toISOString(),
              product: productName,
              amount: (session.amount_total / 100).toFixed(2)
            }
          })
        });

        if (!response.ok) {
          console.error('ConvertKit API error:', await response.text());
        } else {
          console.log(`Successfully added ${email} to ConvertKit with tag ${tagId}`);
        }
      } catch (error) {
        console.error('Error adding to ConvertKit:', error);
      }
    }
  }

  return { statusCode: 200, body: 'Success' };
};
