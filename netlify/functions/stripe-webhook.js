// netlify/functions/stripe-webhook.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify webhook signature for security
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Handle different event types
  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(stripeEvent.data.object);
        break;
      
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(stripeEvent.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return { statusCode: 200, body: 'Success' };
  } catch (error) {
    console.error('Error processing webhook:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};

async function handleCheckoutComplete(session) {
  const email = session.customer_email || session.customer_details?.email;
  const productName = session.metadata?.product_name || 'Item Value Purchase';
  const priceId = session.metadata?.price_id || '';
  
  // Determine which tag to apply based on product
  let tagId;
  let sequenceId;
  
  switch (productName) {
    case 'Single Scan':
      tagId = process.env.CK_TAG_SINGLE_SCAN;
      sequenceId = process.env.CK_SEQUENCE_SINGLE;
      break;
    case 'Starter Pack':
      tagId = process.env.CK_TAG_STARTER_PACK;
      sequenceId = process.env.CK_SEQUENCE_STARTER;
      break;
    case 'Declutter Challenge':
      tagId = process.env.CK_TAG_CHALLENGE;
      sequenceId = process.env.CK_SEQUENCE_CHALLENGE;
      break;
    case 'Weekend Warrior':
      tagId = process.env.CK_TAG_WEEKEND;
      break;
    case 'Moving Master':
      tagId = process.env.CK_TAG_MOVING;
      break;
    case 'Estate Pro':
      tagId = process.env.CK_TAG_ESTATE;
      break;
    default:
      tagId = process.env.CK_TAG_CUSTOMER;
  }

  // Add subscriber to ConvertKit
  if (email && tagId) {
    await addToConvertKit(email, tagId, {
      purchase_date: new Date().toISOString(),
      product: productName,
      amount: (session.amount_total / 100).toFixed(2),
      stripe_customer_id: session.customer
    });
  }

  // Add to sequence if applicable
  if (email && sequenceId) {
    await addToSequence(email, sequenceId);
  }
}

async function handlePaymentSuccess(paymentIntent) {
  // Handle direct payment intents if needed
  console.log('Payment succeeded:', paymentIntent.id);
}

async function addToConvertKit(email, tagId, customFields = {}) {
  const response = await fetch(`https://api.convertkit.com/v3/tags/${tagId}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.CONVERTKIT_API_KEY,
      email: email,
      fields: customFields
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('ConvertKit API error:', error);
    throw new Error(`ConvertKit API failed: ${response.status}`);
  }

  console.log(`Successfully added ${email} to tag ${tagId}`);
  return response.json();
}

async function addToSequence(email, sequenceId) {
  const response = await fetch(`https://api.convertkit.com/v3/sequences/${sequenceId}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.CONVERTKIT_API_KEY,
      email: email
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('ConvertKit Sequence API error:', error);
  } else {
    console.log(`Successfully added ${email} to sequence ${sequenceId}`);
  }
}
