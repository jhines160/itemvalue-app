// Netlify Function: capture-email.js
// Captures emails when users hit the paywall after free scans
// Triggers abandoned scan email sequence via Resend

const RESEND_API_KEY = process.env.RESEND_API_KEY; // Set this in Netlify when you have it
const FROM_EMAIL = 'ItemValue <hello@itemvalue.app>';
const ADMIN_EMAIL = 'jhines160@me.com';

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
    const { email, firstName, scansUsed, lastItemScanned } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Email is required' })
      };
    }

    console.log(`Capturing email: ${email}, scans used: ${scansUsed}`);

    // Send immediate "We saved your progress" email
    const immediateEmail = await sendEmail({
      to: email,
      subject: "Your item values are saved! Here's what we found...",
      html: generateImmediateEmail(firstName, lastItemScanned)
    });

    // Schedule follow-up emails (in production, use a queue service)
    // For now, we'll store in a simple database or use Resend's scheduling
    
    // Email 1: 1 hour later - "Quick tip" email
    await scheduleEmail({
      to: email,
      subject: "Quick tip: The #1 mistake people make when selling items",
      html: generateTipEmail(firstName),
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
    });

    // Email 2: 24 hours later - "Case study" email
    await scheduleEmail({
      to: email,
      subject: "She made $2,847 from items she almost donated...",
      html: generateCaseStudyEmail(firstName),
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    });

    // Email 3: 48 hours later - "Limited offer" email
    await scheduleEmail({
      to: email,
      subject: "Your 20% discount expires tomorrow",
      html: generateOfferEmail(firstName),
      scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48 hours
    });

    // Email 4: 72 hours later - "Final reminder" email
    await scheduleEmail({
      to: email,
      subject: "Last chance: Don't let your items go to waste",
      html: generateFinalEmail(firstName),
      scheduledFor: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() // 72 hours
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true, 
        message: 'Email captured and sequence started',
        emailId: immediateEmail?.id 
      })
    };

  } catch (error) {
    console.error('Error capturing email:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Send email via Resend
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

// Schedule email via Resend (using scheduled_at parameter)
async function scheduleEmail({ to, subject, html, scheduledFor }) {
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
      html: html,
      scheduled_at: scheduledFor
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to schedule email: ${error}`);
    // Don't throw - we don't want to fail the whole request if scheduling fails
    return null;
  }

  return response.json();
}

// Email Templates

function generateImmediateEmail(firstName, lastItem) {
  const name = firstName || 'there';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; padding: 20px 0;">
    <h1 style="color: #0f172a; margin: 0;">Is This Worth Selling?</h1>
  </div>

  <p>Hey ${name}!</p>

  <p>We noticed you've been scanning items to see what they're worth. Smart move! 🎯</p>

  ${lastItem ? `<p>Your last scan was <strong>"${lastItem}"</strong> - did you find a hidden gem?</p>` : ''}

  <p>Here's the thing: <strong>most people have $500-2,000 worth of sellable items</strong> sitting around their house right now. The problem? They either:</p>

  <ul style="padding-left: 20px;">
    <li>Donate items worth real money (ouch!)</li>
    <li>Spend hours listing things that sell for $3 (not worth it)</li>
    <li>Never get around to it at all</li>
  </ul>

  <p>That's exactly why we built this tool - to help you make smart decisions in seconds.</p>

  <div style="background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0;">
    <p style="color: white; margin: 0 0 15px 0; font-size: 18px;">Ready to find your hidden treasure?</p>
    <a href="https://itemvalue.app/pricing" style="display: inline-block; background: white; color: #0284c7; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Unlock Unlimited Scans →</a>
  </div>

  <p>Talk soon,<br>The ItemValue Team</p>

  <p style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
    You're receiving this because you used Is This Worth Selling? at itemvalue.app.<br>
    <a href="https://itemvalue.app/unsubscribe?email={{email}}" style="color: #64748b;">Unsubscribe</a>
  </p>

</body>
</html>
  `;
}

function generateTipEmail(firstName) {
  const name = firstName || 'there';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; padding: 20px 0;">
    <h1 style="color: #0f172a; margin: 0;">Is This Worth Selling?</h1>
  </div>

  <p>Hey ${name},</p>

  <p>Quick tip that could save you hours...</p>

  <p><strong>The #1 mistake people make:</strong> Listing EVERYTHING on eBay.</p>

  <p>Here's the truth: some items just aren't worth the effort. When you factor in:</p>

  <ul style="padding-left: 20px;">
    <li>eBay fees (12.9% + payment processing)</li>
    <li>Shipping costs</li>
    <li>Time to photograph, list, and ship</li>
    <li>Customer questions and potential returns</li>
  </ul>

  <p>...that $15 item might only net you $4 after 45 minutes of work. That's less than minimum wage!</p>

  <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-weight: 600;">🎯 The sweet spot?</p>
    <p style="margin: 10px 0 0 0;">Items that sell for $30+ are usually worth the effort. Below that? Donate and take the tax write-off.</p>
  </div>

  <p>Our tool does this math for you automatically - factoring in real eBay sold data, fees, and effort level.</p>

  <div style="text-align: center; margin: 25px 0;">
    <a href="https://itemvalue.app/pricing" style="display: inline-block; background: #0284c7; color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Make Smarter Decisions →</a>
  </div>

  <p>Happy scanning!<br>The ItemValue Team</p>

  <p style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
    <a href="https://itemvalue.app/unsubscribe?email={{email}}" style="color: #64748b;">Unsubscribe</a>
  </p>

</body>
</html>
  `;
}

function generateCaseStudyEmail(firstName) {
  const name = firstName || 'there';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; padding: 20px 0;">
    <h1 style="color: #0f172a; margin: 0;">Is This Worth Selling?</h1>
  </div>

  <p>Hey ${name},</p>

  <p>I wanted to share a quick story...</p>

  <p>Sarah was cleaning out her parents' house after they downsized. She was about to load up the car for Goodwill when she decided to scan a few items first.</p>

  <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0;">
    <p style="margin: 0; font-weight: 600; color: #047857;">What she found:</p>
    <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #047857;">
      <li>Vintage Pyrex set → $185</li>
      <li>Old camera lenses → $340</li>
      <li>Collectible figurines → $890</li>
      <li>Vintage board games → $220</li>
      <li>Other items → $1,212</li>
    </ul>
    <p style="margin: 15px 0 0 0; font-weight: 700; font-size: 18px; color: #047857;">Total: $2,847</p>
  </div>

  <p>Items she was about to <em>give away for free</em>.</p>

  <p>The craziest part? She spent less than 2 hours scanning everything. That's over $1,400/hour for her time.</p>

  <p><strong>What's sitting in YOUR closets, garage, or storage?</strong></p>

  <div style="text-align: center; margin: 25px 0;">
    <a href="https://itemvalue.app/pricing" style="display: inline-block; background: #0284c7; color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Find Your Hidden Value →</a>
  </div>

  <p>You might be surprised,<br>The ItemValue Team</p>

  <p style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
    <a href="https://itemvalue.app/unsubscribe?email={{email}}" style="color: #64748b;">Unsubscribe</a>
  </p>

</body>
</html>
  `;
}

function generateOfferEmail(firstName) {
  const name = firstName || 'there';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; padding: 20px 0;">
    <h1 style="color: #0f172a; margin: 0;">Is This Worth Selling?</h1>
  </div>

  <p>Hey ${name},</p>

  <p>I wanted to give you a heads up...</p>

  <p>Since you tried our free scans, I'm offering you <strong>20% off</strong> any bundle - but only until tomorrow.</p>

  <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); border: 2px solid #f59e0b; padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0;">
    <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 600;">⏰ LIMITED TIME OFFER</p>
    <p style="margin: 10px 0; font-size: 28px; font-weight: 800; color: #78350f;">20% OFF</p>
    <p style="margin: 0; color: #92400e;">Use code: <strong style="background: white; padding: 5px 12px; border-radius: 4px;">FIRSTSCAN</strong></p>
  </div>

  <p>Here's what you get:</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr style="background: #f8fafc;">
      <td style="padding: 12px; border: 1px solid #e2e8f0;"><strong>Weekend Warrior</strong><br>50 scans, 30 days</td>
      <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: right;"><s>$17</s> <strong style="color: #059669;">$13.60</strong></td>
    </tr>
    <tr>
      <td style="padding: 12px; border: 1px solid #e2e8f0;"><strong>Moving Master</strong><br>200 scans, 60 days</td>
      <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: right;"><s>$37</s> <strong style="color: #059669;">$29.60</strong></td>
    </tr>
    <tr style="background: #f8fafc;">
      <td style="padding: 12px; border: 1px solid #e2e8f0;"><strong>Estate Pro</strong><br>1000 scans, 90 days</td>
      <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: right;"><s>$97</s> <strong style="color: #059669;">$77.60</strong></td>
    </tr>
  </table>

  <div style="text-align: center; margin: 25px 0;">
    <a href="https://itemvalue.app/pricing?discount=FIRSTSCAN" style="display: inline-block; background: #0284c7; color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Claim Your 20% Off →</a>
  </div>

  <p>Expires tomorrow at midnight!</p>

  <p>- The ItemValue Team</p>

  <p style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
    <a href="https://itemvalue.app/unsubscribe?email={{email}}" style="color: #64748b;">Unsubscribe</a>
  </p>

</body>
</html>
  `;
}

function generateFinalEmail(firstName) {
  const name = firstName || 'there';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; padding: 20px 0;">
    <h1 style="color: #0f172a; margin: 0;">Is This Worth Selling?</h1>
  </div>

  <p>Hey ${name},</p>

  <p>This is my last email about this...</p>

  <p>I get it - life gets busy. But I keep thinking about all the items sitting in closets and garages that could be turned into real money.</p>

  <p>Here's the honest truth:</p>

  <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">
      Every day you wait, you're potentially leaving money on the table. Vintage items lose value. Trends change. And that motivation to declutter? It fades.
    </p>
  </div>

  <p>I've seen it happen too many times: people donate a box of "old stuff" only to find out later that one item was worth hundreds.</p>

  <p>Don't let that be you.</p>

  <p><strong>Your 20% discount expires tonight.</strong> After that, it's back to full price.</p>

  <div style="text-align: center; margin: 25px 0;">
    <a href="https://itemvalue.app/pricing?discount=FIRSTSCAN" style="display: inline-block; background: #dc2626; color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Last Chance: Get 20% Off →</a>
    <p style="font-size: 13px; color: #64748b; margin-top: 10px;">Code: FIRSTSCAN (expires tonight)</p>
  </div>

  <p>Whatever you decide, good luck with your decluttering!</p>

  <p>- The ItemValue Team</p>

  <p style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
    <a href="https://itemvalue.app/unsubscribe?email={{email}}" style="color: #64748b;">Unsubscribe</a>
  </p>

</body>
</html>
  `;
}
