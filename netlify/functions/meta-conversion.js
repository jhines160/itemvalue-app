// Netlify Function: meta-conversion.js
// Sends purchase events to Meta Conversion API (server-side tracking)

const PIXEL_ID = '1383551356849358';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

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
    const {
      eventName,
      eventTime,
      email,
      value,
      currency,
      contentName,
      contentCategory,
      eventSourceUrl,
      clientUserAgent,
      clientIpAddress,
      fbc,
      fbp
    } = JSON.parse(event.body);

    // Hash email for privacy (SHA256)
    const crypto = require('crypto');
    const hashedEmail = email ? crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex') : null;

    // Build the event data
    const eventData = {
      event_name: eventName || 'Purchase',
      event_time: eventTime || Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: eventSourceUrl || 'https://itemvalue.app',
      user_data: {
        em: hashedEmail ? [hashedEmail] : undefined,
        client_ip_address: clientIpAddress || event.headers['x-forwarded-for'] || event.headers['client-ip'],
        client_user_agent: clientUserAgent || event.headers['user-agent'],
        fbc: fbc || undefined,
        fbp: fbp || undefined
      },
      custom_data: {
        currency: currency || 'USD',
        value: value || 0,
        content_name: contentName,
        content_category: contentCategory || 'ItemValue Bundle'
      }
    };

    // Remove undefined values
    Object.keys(eventData.user_data).forEach(key => 
      eventData.user_data[key] === undefined && delete eventData.user_data[key]
    );

    // Send to Meta Conversion API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [eventData],
          test_event_code: process.env.META_TEST_CODE || undefined // Remove in production
        })
      }
    );

    const result = await response.json();
    
    if (result.error) {
      console.error('Meta API error:', result.error);
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, error: result.error.message })
      };
    }

    console.log('Meta event sent:', eventName, result);
    
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, result })
    };

  } catch (error) {
    console.error('Meta conversion error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
