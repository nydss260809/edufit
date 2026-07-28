export default async function handler(req, res) {
  // CORS configuration headers for local development and cross-origin access
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }

  try {
    const { prompt, systemInstruction } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt field is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Server GEMINI_API_KEY is not configured in environment variables.'
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: systemInstruction
                ? `${systemInstruction}\n\n${prompt}`
                : prompt
            }
          ]
        }
      ]
    };

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Upstream Error:', errorText);
      return res.status(response.status).json({
        error: 'Failed to generate content from Gemini API upstream.',
        details: errorText
      });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({
      success: true,
      text: generatedText
    });
  } catch (err) {
    console.error('Internal Server Error in /api/generate:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message
    });
  }
}