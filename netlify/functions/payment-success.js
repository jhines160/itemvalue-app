// Netlify Function: payment-success.js
// Handles successful payments, generates access codes, and sends notifications
// Updated with Resend email integration

const RESEND_API_KEY = process.env.RESEND_API_KEY; // Set this in Netlify when domain verifies
const FROM_EMAIL = 'ItemValue <hello@itemvalue.app>';
const ADMIN_EMAIL = 'jhines160@me.com';
const STRIPE_SECRET_KEY = 'sk_test_51Rfi8gFHvpgYQe5JbaTc3vM3SeKusCJEFFEVi9OxjnJ2PXjHzaIJqYxlTNkqamEZG148EgYyisn3ssTTdhosVT8J00yhBqlXJm';

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
    const {
      paymentIntentId,
      email,
      firstName,
      lastName,
      orderBump,
      amount,
      product,
      bundleType: sentBundleType
    } = JSON.parse(event.body);

    console.log(`Processing successful payment: ${paymentIntentId} for ${email}`);

    // Determine bundle type from bundleType, product, or amount
    let bundleType = 'weekend';
    if (sentBundleType) {
      if (sentBundleType.toLowerCase().includes('moving')) bundleType = 'moving';
      else if (sentBundleType.toLowerCase().includes('estate')) bundleType = 'estate';
      else bundleType = 'weekend';
    } else if (product) {
      if (product.includes('moving')) bundleType = 'moving';
      else if (product.includes('estate')) bundleType = 'estate';
    }

    // Generate access code
    const accessCode = generateAccessCode(bundleType, orderBump);
    
    // Get bundle details
    const bundleDetails = getBundleDetails(bundleType, orderBump);

    // Calculate amount in cents for display
    const amountInCents = typeof amount === 'number' && amount < 1000 ? amount * 100 : amount;

    // ========================================
    // SEND EMAIL NOTIFICATIONS VIA RESEND
    // ========================================
    
    if (RESEND_API_KEY) {
      try {
        // 1. Send admin notification
        await sendAdminNotification({
          customerEmail: email,
          customerName: `${firstName} ${lastName}`,
          bundleType,
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
          bundleType,
          bundleDetails,
          amount: amountInCents,
          orderBump,
          accessCode
        });
        console.log('Customer confirmation sent successfully');

      } catch (emailError) {
        // Log but don't fail the payment
        console.error('Email notification error:', emailError);
      }
    } else {
      console.log('RESEND_API_KEY not set - skipping email notifications');
    }

    // Return success response with access code
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        accessCode: accessCode,
        bundle: bundleDetails.name,
        scans: bundleDetails.scans,
        days: bundleDetails.days,
        message: `${bundleDetails.name} activated! ${bundleDetails.scans} scans for ${bundleDetails.days} days.`
      })
    };

  } catch (error) {
    console.error('Payment success handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
// Send customer confirmation email
async function sendCustomerConfirmation({ customerEmail, firstName, bundleType, bundleDetails, amount, orderBump, accessCode }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: customerEmail,
      subject: '🎉 Your ItemValue Access Code',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Welcome to ItemValue!</h1>
          </div>
          <div style="padding: 30px; background: #f8fafc;">
            <p style="font-size: 18px; color: #1e293b;">Hi ${firstName}! 👋</p>
            <p style="color: #64748b;">Thank you for your purchase! Your <strong>${bundleType}</strong> bundle is ready to use.</p>
            
            <div style="background: white; border: 2px solid #10b981; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #065f46; font-size: 14px;">Your Access Code</p>
              <p style="margin: 0; font-size: 28px; font-weight: bold; color: #10b981; font-family: monospace;">${accessCode}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://itemvalue.app/?code=${accessCode}" style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Activate & Start Scanning →</a>
            </div>
            
            <div style="background: white; border-radius: 8px; padding: 15px; margin-top: 20px;">
              <p style="margin: 0 0 10px 0; font-weight: 600; color: #1e293b;">Your Bundle Details:</p>
              <p style="margin: 5px 0; color: #64748b;">📦 ${bundleDetails.scans} item scans</p>
              <p style="margin: 5px 0; color: #64748b;">📅 ${bundleDetails.days} days access</p>
              ${orderBump ? '<p style="margin: 5px 0; color: #64748b;">⭐ Year extension included</p>' : ''}
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
    throw new Error('Failed to send customer email');
  }
  
  return response.json();
}
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
      bumpPrice: 10
    },
    estate: {
      name: 'Estate Pro',
      scans: 1000,
      days: hasYearExtension ? 365 : 90,
      basePrice: 97,
      bumpPrice: 15
    }
  };
  return bundles[bundleType] || bundles.weekend;
}

// Send admin notification email
async function sendAdminNotification({ 
  customerEmail, 
  customerName, 
  bundleType, 
  bundleDetails, 
  amount, 
  orderBump, 
  accessCode,
  paymentId,
  timestamp 
}) {
  const date = new Date(timestamp || Date.now()).toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const displayAmount = (amount / 100).toFixed(2);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">💰 New Purchase!</h1>
    <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: 800;">$${displayAmount}</p>
  </div>

  <div style="background: #f8fafc; padding: 25px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
    
    <h2 style="margin: 0 0 20px 0; color: #0f172a;">Order Details</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Customer</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: right;">${customerName || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Email</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: right;">
          <a href="mailto:${customerEmail}" style="color: #0284c7;">${customerEmail}</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Bundle</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: right;">
          ${bundleDetails.name}
          <br><span style="font-weight: normal; font-size: 13px; color: #64748b;">${bundleDetails.scans} scans, ${bundleDetails.days} days</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Year Extension</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: right;">
          ${orderBump ? '✅ Yes (+$' + bundleDetails.bumpPrice + ')' : '❌ No'}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Access Code</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: right; font-family: monospace; font-size: 12px;">${accessCode}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Payment ID</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 11px; text-align: right;">${paymentId || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #64748b;">Date</td>
        <td style="padding: 10px 0; text-align: right;">${date}</td>
      </tr>
    </table>

    <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #e2e8f0;">
      <a href="https://dashboard.stripe.com/payments/${paymentId}" style="display: inline-block; background: #0284c7; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View in Stripe →</a>
    </div>

  </div>

  <p style="text-align: center; font-size: 12px; color: #94a3b8; margin-top: 20px;">
    ItemValue.app Purchase Notification
  </p>

</body>
</html>
  `;

  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `💰 New Purchase: ${bundleDetails.name} - $${displayAmount}`,
    html
  });
}

// Send customer confirmation email
async function sendCustomerConfirmation({ 
  customerEmail, 
  firstName, 
  bundleType, 
  bundleDetails, 
  amount, 
  orderBump, 
  accessCode 
}) {
  const activationUrl = `https://itemvalue.app/?code=${accessCode}`;
  const displayAmount = (amount / 100).toFixed(2);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #0ea5e9, #0284c7); border-radius: 12px;">
    <h1 style="color: white; margin: 0 0 10px 0;">🎉 You're All Set!</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 18px;">Your ${bundleDetails.name} is ready to use</p>
  </div>

  <div style="padding: 30px 0;">
    <p>Hey ${firstName}!</p>

    <p>Thank you for your purchase! Your scanning bundle is activated and ready to go.</p>

    <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 25px; margin: 25px 0; text-align: center;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #15803d; font-weight: 600;">YOUR ACCESS CODE</p>
      <p style="margin: 0; font-size: 20px; font-family: monospace; background: white; padding: 12px 20px; border-radius: 8px; display: inline-block; letter-spacing: 1px; font-weight: 600;">${accessCode}</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${activationUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 18px;">Start Scanning Now →</a>
    </div>

    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #0f172a;">What You Got:</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Bundle</td>
          <td style="padding: 8px 0; font-weight: 600; text-align: right;">${bundleDetails.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Scans</td>
          <td style="padding: 8px 0; font-weight: 600; text-align: right;">${bundleDetails.scans} items</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Valid For</td>
          <td style="padding: 8px 0; font-weight: 600; text-align: right;">${bundleDetails.days} days</td>
        </tr>
        ${orderBump ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Year Extension</td>
          <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #059669;">✅ Included</td>
        </tr>
        ` : ''}
        <tr style="border-top: 2px solid #e2e8f0;">
          <td style="padding: 12px 0; font-weight: 600;">Total Paid</td>
          <td style="padding: 12px 0; font-weight: 700; text-align: right; font-size: 20px; color: #0f172a;">$${displayAmount}</td>
        </tr>
      </table>
    </div>

    <h3 style="color: #0f172a;">Quick Start Tips:</h3>
    <ol style="padding-left: 20px; color: #475569;">
      <li style="margin-bottom: 10px;"><strong>Click the button above</strong> or paste your access code at itemvalue.app</li>
      <li style="margin-bottom: 10px;"><strong>Start typing any item</strong> you want to evaluate</li>
      <li style="margin-bottom: 10px;"><strong>Get instant results</strong> with real eBay sold data</li>
      <li style="margin-bottom: 10px;"><strong>Check your history</strong> to see all your scanned items</li>
    </ol>

    <p>Questions? Just reply to this email - we're happy to help!</p>

    <p>Happy scanning!<br>The ItemValue Team</p>
  </div>

  <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
    <p style="font-size: 12px; color: #64748b; margin: 0;">
      This is your purchase confirmation for ItemValue.app<br>
      Keep this email - it contains your access code!
    </p>
  </div>

</body>
</html>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `🎉 Your ${bundleDetails.name} is ready! Here's your access code`,
    html
  });
}

// Send email via Resend API
async function sendEmail({ to, subject, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: to,
      subject: subject,
      html: html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return response.json();
}
