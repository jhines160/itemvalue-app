// Netlify Function: Photo Scanning with GPT-4 Vision
const VALUATION_PROMPT = `You are an expert resale value estimator. Analyze this image of an item and provide:

1. **Item Identification**: What is this item? Be specific (brand, model, type if visible)
2. **Condition Assessment**: Rate as Excellent, Good, Fair, or Poor based on visible condition
3. **Estimated Resale Value**: Your best estimate in USD
4. **Value Range**: Low to high realistic range
5. **Best Selling Platforms**: Top 2-3 platforms for this specific item
6. **Quick Tips**: 1-2 sentences on how to maximize value

Respond in this exact JSON format:
{
  "itemName": "Specific item name",
  "condition": "Good",
  "estimatedValue": 45,
  "valueRange": { "low": 30, "high": 60 },
  "bestPlatforms": ["eBay", "Facebook Marketplace"],
  "tips": "Clean thoroughly before listing. Include original packaging if available.",
  "confidence": "high"
}

Confidence levels:
- "high": Clear image, recognizable item, strong market data
- "medium": Decent image but some uncertainty 
- "low": Unclear image or very niche item

If you cannot identify the item, respond with:
{
  "error": "Could not identify item. Please try a clearer photo.",
  "suggestion": "Try taking the photo in better lighting or from a different angle."
}`;

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { image, mimeType } = JSON.parse(event.body);

    if (!image) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No image provided' }),
      };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VALUATION_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${image}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error('OpenAI API error');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let jsonStr = content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim());

    if (result.error) {
      return {
        statusCode: 422,
        body: JSON.stringify(result),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Photo scan error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to analyze image. Please try again.' }),
    };
  }
};
