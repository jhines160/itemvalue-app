// netlify/functions/stripe-webhook.js
// Handles Stripe Payment Link purchases: generates access codes and sends emails

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'ItemValue <hello@itemvalue.app>';
const ADMIN_EMAIL = 'jhines160@me.com';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const CONVERTKIT_API_KEY = process.env.CONVERTKIT_API_KEY;

  const stripe = require('stripe')(STRIPE_SECRET_KEY);

  // Verify webhook signature
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

  // Handle checkout.session.completed (fires for Payment Links)
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_email || session.customer_details?.email;
    const customerName = session.customer_details?.name || 'Customer';
    const firstName = customerName.split(' ')[0] || 'there';
    const amountInCents = session.amount_total;
    const productName = session.metadata?.product_name || '';

    console.log(`Payment received: $${(amountInCents / 100).toFixed(2)} from ${email}`);

    // ============================================
    // DETERMINE BUNDLE TYPE
    // Match by amount (in cents) since Payment Links
    // won't always have product metadata
    // ============================================
    let bundleKey = 'weekend'; // default: 50 scans

    if (amountInCents >= 9700) {
      bundleKey = 'estate';
    } else if (amountInCents >= 3700) {
      bundleKey = 'moving';
    } else if (amountInCents >= 2700) {
      bundleKey = 'challenge';
    } else if (amountInCents >= 1700) {
      bundleKey = 'weekend';
    } else if (amountInCents >= 700) {
      bundleKey = 'starter';
    } else if (amountInCents >= 200) {
      bundleKey = 'single';
    }

    // Also check product name metadata if available
    if (productName) {
      const pn = productName.toLowerCase();
      if (pn.includes('estate')) bundleKey = 'estate';
      else if (pn.includes('moving')) bundleKey = 'moving';
      else if (pn.includes('challenge')) bundleKey = 'challenge';
      else if (pn.includes('weekend')) bundleKey = 'weekend';
      else if (pn.includes('starter')) bundleKey = 'starter';
      else if (pn.includes('single')) bundleKey = 'single';
    }

    // ============================================
    // GENERATE ACCESS CODE & GET BUNDLE DETAILS
    // ============================================
    const accessCode = generateAccessCode(bundleKey);
    const bundleDetails = getBundleDetails(bundleKey);

    console.log(`Bundle: ${bundleDetails.name}, Code: ${accessCode}, Scans: ${bundleDetails.scans}`);

    // ============================================
    // SEND EMAILS VIA RESEND
    // ============================================
    if (RESEND_API_KEY && email) {
      try {
        // 1. Send admin notification
        await sendAdminNotification({
          customerEmail: email,
          customerName: customerName,
          bundleType: bundleDetails.name,
          bundleDetails,
          amount: amountInCents,
          accessCode,
          paymentId: session.payment_intent || session.id,
          timestamp: new Date().toISOString()
        });
        console.log('Admin notification sent');

        // 2. Send customer their access code
        await sendCustomerConfirmation({
          customerEmail: email,
          firstName: firstName,
          bundleType: bundleDetails.name,
          bundleDetails,
          amount: amountInCents,
          accessCode
        });
        console.log('Customer confirmation sent');

      } catch (emailError) {
        console.error('Email error:', emailError);
      }
    }

    // ============================================
    // TAG IN CONVERTKIT (existing functionality)
    // ============================================
    if (email && CONVERTKIT_API_KEY) {
      const tagMap = {
        single: process.env.CK_TAG_SINGLE_SCAN,
        starter: process.env.CK_TAG_STARTER_PACK,
        challenge: process.env.CK_TAG_CHALLENGE,
        weekend: process.env.CK_TAG_WEEKEND,
        moving: process.env.CK_TAG_MOVING,
        estate: process.env.CK_TAG_ESTATE
      };

      const tagId = tagMap[bundleKey] || process.env.CK_TAG_CUSTOMER;

      if (tagId) {
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
                product: bundleDetails.name,
                amount: (amountInCents / 100).toFixed(2)
              }
            })
          });

          if (!response.ok) {
            console.error('ConvertKit API error:', await response.text());
          } else {
            console.log(`ConvertKit: ${email} tagged with ${tagId}`);
          }
        } catch (error) {
          console.error('ConvertKit error:', error);
        }
      }
    }
  }

  return { statusCode: 200, body: 'Success' };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateAccessCode(bundleKey) {
  const prefixes = {
    single: 'SINGLE',
    starter: 'STARTER',
    challenge: 'CHALLENGE',
    weekend: 'WEEKEND',
    moving: 'MOVING',
    estate: 'ESTATE'
  };

  const prefix = prefixes[bundleKey] || 'WEEKEND';
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  const year = new Date().getFullYear();

  return `${prefix}-${randomPart}-${year}`;
}

function getBundleDetails(bundleKey) {
  const bundles = {
    single: { name: 'Single Scan', scans: 1, days: 30 },
    starter: { name: 'Starter Pack', scans: 25, days: 365 },
    challenge: { name: 'Challenge Bundle', scans: 100, days: 365 },
    weekend: { name: 'Weekend Warrior', scans: 50, days: 30 },
    moving: { name: 'Moving Master', scans: 200, days: 60 },
    estate: { name: 'Estate Pro', scans: 1000, days: 90 }
  };

  return bundles[bundleKey] || bundles.weekend;
}

// Send admin notification email
async function sendAdminNotification(data) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `💰 New ItemValue Purchase - ${data.bundleType}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">💰 New Purchase!</h1>
          </div>
          <div style="padding: 20px; background: #f8fafc;">
            <h2 style="color: #1e293b;">Order Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Customer:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${data.customerName}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${data.customerEmail}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Bundle:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${data.bundleType}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Amount:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">$${(data.amount / 100).toFixed(2)}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Scans:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${data.bundleDetails.scans}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Access Code:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${data.accessCode}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Payment ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${data.paymentId}</td></tr>
              <tr><td style="padding: 8px;"><strong>Time:</strong></td><td style="padding: 8px;">${new Date(data.timestamp).toLocaleString()}</td></tr>
            </table>
          </div>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Admin email failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Send customer confirmation email with access code
async function sendCustomerConfirmation(data) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: '🎉 Your ItemValue Access Code',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Welcome to ItemValue!</h1>
          </div>
          <div style="padding: 30px; background: #f8fafc;">
            <p style="font-size: 18px; color: #1e293b;">Hi ${data.firstName}! 👋</p>
            <p style="color: #64748b;">Thank you for your purchase! Your <strong>${data.bundleType}</strong> bundle is ready to use.</p>
            
            <div style="background: white; border: 2px solid #10b981; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #065f46; font-size: 14px;">Your Access Code</p>
              <p style="margin: 0; font-size: 28px; font-weight: bold; color: #10b981; font-family: monospace;">${data.accessCode}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://itemvalue.app/?code=${data.accessCode}" style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Activate & Start Scanning →</a>
            </div>
            
            <div style="background: white; border-radius: 8px; padding: 15px; margin-top: 20px;">
              <p style="margin: 0 0 10px 0; font-weight: 600; color: #1e293b;">Your Bundle Details:</p>
              <p style="margin: 5px 0; color: #64748b;">📦 ${data.bundleDetails.scans} item scans</p>
              <p style="margin: 5px 0; color: #64748b;">📅 ${data.bundleDetails.days} days access</p>
            </div>
            
            <p style="color: #64748b; margin-top: 30px; font-size: 14px;">Questions? Just reply to this email!</p>
          </div>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Customer email error:', error);
    throw new Error(`Customer email failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}
