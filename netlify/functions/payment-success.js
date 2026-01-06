// Netlify Function: payment-success.js
// Handles successful payments, generates access codes, and sends notifications

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'ItemValue <hello@itemvalue.app>';
const ADMIN_EMAIL = 'jhines160@me.com';
const STRIPE_SECRET_KEY = 'sk_test_51Rfi8gFHvpgYQe5JbaTc3vM3SeKusCJEFFEVi9OxjnJ2PXjHzaIJqYx1TNkqamEZG148EgYyisn3ssTTdhosVT8J00yhBqlXJm';

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('Received body:', event.body);
    
    const {
      paymentMethodId,
      customerEmail,
      customerName,
      firstName,
      orderBump,
      amount,
      bundleType,
      scans,
      days
    } = JSON.parse(event.body);

    const email = customerEmail;
    const sentBundleType = bundleType;

    // Actually charge the card with Stripe
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        amount: amount.toString(),
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: 'true',
        description: `ItemValue - ${sentBundleType || 'Bundle'}`,
        receipt_email: email
      }).toString()
    });

    const paymentResult = await stripeResponse.json();
    
    if (paymentResult.error) {
      console.error('Stripe error:', paymentResult.error);
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, error: paymentResult.error.message })
      };
    }

    if (paymentResult.status !== 'succeeded') {
      console.error('Payment not succeeded:', paymentResult.status);
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, error: 'Payment was not successful' })
      };
    }

    const paymentIntentId = paymentResult.id;
    console.log(`Processing successful payment: ${paymentIntentId} for ${email}`);

    // Determine bundle type
    let bundleKey = 'weekend';
    if (sentBundleType) {
      if (sentBundleType.toLowerCase().includes('moving')) bundleKey = 'moving';
      else if (sentBundleType.toLowerCase().includes('estate')) bundleKey = 'estate';
    }

    // Generate access code
    const accessCode = generateAccessCode(bundleKey, orderBump);
    
    // Get bundle details
    const bundleDetails = getBundleDetails(bundleKey, orderBump);
    const amountInCents = amount;

    // Send emails
    if (RESEND_API_KEY) {
      try {
        // 1. Send admin notification
        await sendAdminNotification({
          customerEmail: email,
          customerName: customerName || firstName || 'Customer',
          bundleType: sentBundleType || bundleKey,
          bundleDetails,
          amount: amountInCents,
          orderBump,
          accessCode,
          paymentId: paymentIntentId,
          timestamp: new Date().toISOString()
        });
        console.log('Admin notification sent successfully');

        // 2. Send customer confirmation
        await sendCustomerConfirmation({
          customerEmail: email,
          firstName: firstName || 'there',
          bundleType: sentBundleType || bundleKey,
          bundleDetails,
          amount: amountInCents,
          orderBump,
          accessCode
        });
        console.log('Customer confirmation sent successfully');

      } catch (emailError) {
        console.error('Email notification error:', emailError);
      }
    } else {
      console.log('RESEND_API_KEY not set - skipping email notifications');
    }

    // Return success with access code
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        accessCode,
        bundleType: sentBundleType || bundleKey,
        scans: bundleDetails.scans,
        days: bundleDetails.days
      })
    };

  } catch (error) {
    console.error('Payment processing error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};

// Generate access code based on bundle type
function generateAccessCode(bundleType, hasYearExtension) {
  const prefixes = {
    weekend: 'WEEKEND',
    moving: 'MOVING',
    estate: 'ESTATE'
  };
  
  const bundleKey = bundleType.toLowerCase().split(' ')[0];
  const prefix = prefixes[bundleKey] || 'WEEKEND';
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  const year = new Date().getFullYear();
  const suffix = hasYearExtension ? '-YEAR' : '';
  
  return `${prefix}-${randomPart}-${year}${suffix}`;
}

// Get bundle details
function getBundleDetails(bundleType, hasYearExtension) {
  const bundles = {
    weekend: {
      name: 'Weekend Warrior',
      scans: 50,
      days: hasYearExtension ? 365 : 30,
      basePrice: 17,
      bumpPrice: 7
    },
    moving: {
      name: 'Moving Master',
      scans: 200,
      days: hasYearExtension ? 365 : 60,
      basePrice: 37,
      bumpPrice: 17
    },
    estate: {
      name: 'Estate Pro',
      scans: 1000,
      days: hasYearExtension ? 365 : 90,
      basePrice: 97,
      bumpPrice: 47
    }
  };
  
  return bundles[bundleType] || bundles.weekend;
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
              <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Year Extension:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${data.orderBump ? 'Yes' : 'No'}</td></tr>
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

// Send customer confirmation email
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
              ${data.orderBump ? '<p style="margin: 5px 0; color: #64748b;">⭐ Year extension included</p>' : ''}
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
