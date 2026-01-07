// Netlify Function: capture-email.js
// Handles abandoned cart emails when users run out of free scans

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'ItemValue <hello@itemvalue.app>';
const ADMIN_EMAIL = 'jhines160@me.com';

exports.handler = async (event, context) => {
  // Handle CORS
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
    const { email, firstName, source } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Email is required' })
      };
    }

    console.log(`Capturing email: ${email} from ${source || 'scan-limit'}`);

    if (RESEND_API_KEY) {
      // Send immediate abandoned cart email to user
      await sendAbandonedCartEmail(email, firstName || 'there');
      console.log('Abandoned cart email sent to user');

      // Notify admin of new lead
      await sendLeadNotification(email, firstName, source);
      console.log('Lead notification sent to admin');
    } else {
      console.log('RESEND_API_KEY not set - skipping emails');
    }

    // Log to Google Sheet (if configured)
    if (process.env.LEAD_LOG_URL) {
      fetch(process.env.LEAD_LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          firstName: firstName || '',
          source: source || 'scan-limit',
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.log('Lead logging error:', err));
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, message: 'Email captured successfully' })
    };

  } catch (error) {
    console.error('Capture email error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};

// Send abandoned cart email to user
async function sendAbandonedCartEmail(email, firstName) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: '💰 You were SO close to finding hidden money...',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
          
          <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Hey ${firstName}! 👋</h1>
            <p style="color: #94a3b8; margin-top: 10px; font-size: 16px;">You were just getting started...</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              I noticed you used up your 3 free scans on ItemValue. 
            </p>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              That means you've got <strong>more items you're curious about</strong> — and probably some hidden money sitting in your closet, garage, or storage.
            </p>
            
            <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0;">
              <p style="margin: 0; color: #065f46; font-size: 15px;">
                <strong>Quick story:</strong> One user found a $180 vintage lamp they almost donated. Another discovered their "junk" electronics were worth $340 on eBay.
              </p>
            </div>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              <strong>What could YOUR stuff be worth?</strong>
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://elaroedge.com/itemvalue" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                See Pricing Options →
              </a>
            </div>
            
            <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>🎯 Most popular:</strong> Weekend Warrior (50 scans for $17) — that's just 34¢ per item to know if it's worth selling!
              </p>
            </div>
            
            <p style="font-size: 14px; color: #64748b; line-height: 1.6;">
              Questions? Just reply to this email — I read every one.
            </p>
            
            <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
              Happy decluttering!<br>
              <strong>The ItemValue Team</strong>
            </p>
          </div>
          
          <div style="padding: 20px; text-align: center; background: #f1f5f9;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
              You're receiving this because you signed up at ItemValue.app<br>
              <a href="https://itemvalue.app" style="color: #64748b;">Visit ItemValue</a>
            </p>
          </div>
          
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Abandoned cart email error:', error);
    throw new Error(`Abandoned cart email failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Send lead notification to admin
async function sendLeadNotification(email, firstName, source) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `📧 New ItemValue Lead: ${email}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0ea5e9; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">📧 New Lead Captured!</h1>
          </div>
          <div style="padding: 20px; background: #f8fafc;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Email:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>First Name:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${firstName || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Source:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${source || 'Scan limit reached'}</td>
              </tr>
              <tr>
                <td style="padding: 10px;"><strong>Time:</strong></td>
                <td style="padding: 10px;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
            <p style="margin-top: 20px; color: #64748b; font-size: 14px;">
              An abandoned cart email has been automatically sent to this user.
            </p>
          </div>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Lead notification error:', error);
    throw new Error(`Lead notification failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}
