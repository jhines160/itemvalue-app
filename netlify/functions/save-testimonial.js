exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    
    if (!data.feedback) {
      return { statusCode: 400, body: 'Feedback required' };
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Item Value <noreply@itemvalue.app>',
        to: 'jhines160@me.com',  // <-- Replace with your email
        subject: `💬 New Testimonial${data.canFeature ? ' (OK to feature!)' : ''}`,
        html: `
          <h2>New testimonial received</h2>
          <blockquote style="font-size: 18px; border-left: 4px solid #0D7C66; padding-left: 16px; margin: 20px 0;">
            "${data.feedback}"
          </blockquote>
          <p><strong>Name:</strong> ${data.firstName || 'Not provided'}</p>
          <p><strong>Can feature:</strong> ${data.canFeature ? '✅ Yes' : '❌ No'}</p>
          <p><strong>Trigger value:</strong> $${data.triggerValue}</p>
          <p><strong>Total scans:</strong> ${data.scanCount}</p>
          <p><strong>Submitted:</strong> ${new Date(data.submittedAt).toLocaleString()}</p>
        `
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to save testimonial' })
    };
  }
};
