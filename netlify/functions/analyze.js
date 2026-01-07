// Netlify Function: analyze.js
// Analyzes items using SerpAPI for eBay data + Claude AI for recommendations

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SCAN_LOG_URL = 'https://script.google.com/macros/s/AKfycbz4h94F0683Ks3FqBDBSfnEvhygozMJzlpI-edzJpI6Wmx7oGd-8IImtvH4l3kX5jF0Ug/exec';exports.handler = async (event, context) => {
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
      itemDescription, 
      category, 
      condition, 
      originalPrice, 
      urgency, 
      brand, 
      defects, 
      additionalInfo 
    } = JSON.parse(event.body);

    console.log(`Analyzing item: ${itemDescription}`);

    // Step 1: Search eBay sold listings via SerpAPI
    let ebayData = null;
    let marketDataText = '';

    if (SERPAPI_KEY) {
      try {
        const searchQuery = encodeURIComponent(`${brand ? brand + ' ' : ''}${itemDescription}`);
        const serpApiUrl = `https://serpapi.com/search.json?engine=ebay&_nkw=${searchQuery}&LH_Complete=1&LH_Sold=1&_sop=13&api_key=${SERPAPI_KEY}`;
        
        const serpResponse = await fetch(serpApiUrl);
        
        if (serpResponse.ok) {
          ebayData = await serpResponse.json();
          
          if (ebayData.organic_results && ebayData.organic_results.length > 0) {
            const soldItems = ebayData.organic_results.slice(0, 5);
            const prices = soldItems
              .map(item => {
                const priceStr = item.price?.extracted || item.price?.raw;
                if (priceStr) {
                  const num = parseFloat(String(priceStr).replace(/[^0-9.]/g, ''));
                  return isNaN(num) ? null : num;
                }
                return null;
              })
              .filter(p => p !== null && p > 0);

            if (prices.length > 0) {
              const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
              const minPrice = Math.min(...prices);
              const maxPrice = Math.max(...prices);
              
              marketDataText = `Found ${prices.length} recent eBay sold listings. Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}. Average sold price: $${avgPrice.toFixed(2)}.`;
              
              // Add some example listings
              const examples = soldItems.slice(0, 3).map(item => item.title).join('; ');
              marketDataText += ` Recent sales include: ${examples}`;
            }
          }
        }
      } catch (serpError) {
        console.error('SerpAPI error:', serpError);
        // Continue without market data
      }
    }

    // Step 2: Build prompt for Claude
    const prompt = `You are an expert at evaluating items for resale on eBay and other marketplaces. Analyze this item and provide a recommendation.

ITEM DETAILS:
- Description: ${itemDescription}
- Category: ${category || 'Not specified'}
- Condition: ${condition || 'Not specified'}
- Original Price Paid: ${originalPrice ? '$' + originalPrice : 'Unknown'}
- Time to Sell: ${urgency || 'Flexible'}
- Brand: ${brand || 'Not specified'}
- Defects: ${defects || 'None mentioned'}
- Additional Info: ${additionalInfo || 'None'}

${marketDataText ? `REAL EBAY MARKET DATA:\n${marketDataText}` : 'No recent eBay sold data available - estimate based on your knowledge.'}

INSTRUCTIONS:
1. Based on the market data (if available) and your knowledge, estimate a realistic selling price
2. Calculate eBay fees (13% + $0.30 payment processing)
3. Estimate shipping cost based on typical item size/weight
4. Calculate net profit after fees and shipping
5. Determine if selling is worth the effort (consider time to list, ship, handle questions)
6. Rate the effort level: "easy" (quick ship, standard item), "medium" (some effort), or "hard" (fragile, complex, low demand)

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
{
  "recommendation": "sell" or "donate",
  "reason": "Brief explanation of your recommendation",
  "marketData": "Summary of market findings or estimate basis",
  "estimatedSalePrice": 00.00,
  "platformFees": 00.00,
  "shippingCost": 00.00,
  "netProfit": 00.00,
  "taxDeduction": 00.00,
  "effortScore": "easy" or "medium" or "hard",
  "effortReason": "Why this effort level"
}

RULES:
- If net profit < $10 after fees/shipping, recommend "donate"
- If item is very hard to ship or low demand, lean toward "donate"
- Tax deduction should be ~30% of fair market value for donations
- Be realistic about shipping costs (USPS, UPS, or FedEx rates)
- Consider the seller's time (listing, photos, packing, shipping, customer service)`;

    // Step 3: Call Claude API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!anthropicResponse.ok) {
      const errorData = await anthropicResponse.json();
      console.error('Anthropic API error:', errorData);
      return {
        statusCode: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
        },
        body: JSON.stringify({ 
          error: errorData.error || 'Anthropic API error',
          type: 'anthropic_error'
        })
      };
    }

    const anthropicData = await anthropicResponse.json();
    console.log('Analysis complete');
    
// Log scan to Google Sheet (don't wait for response)
    fetch(SCAN_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: itemName,
        category: category || 'Not specified',
        condition: condition || 'Not specified',
        userType: 'unknown'
      })
    }).catch(err => console.log('Logging error:', err));
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(anthropicData)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: error.message,
        type: 'function_error'
      })
    };
  }
};
