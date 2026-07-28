export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. POST 요청만 지원합니다.' });
  }

  // 환경변수에서 Gemini API 키 읽기 (GEMINI_API_KEY 또는 gemini_api_key 모두 지원)
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY가 서버 환경 변수에 설정되어 있지 않습니다. Vercel 설정에서 GEMINI_API_KEY 환경변수를 추가해주세요.'
    });
  }

  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: '분석할 이미지 데이터(imageBase64)가 필요합니다.' });
    }

    // 시스템 프롬프트 정의
    const systemInstruction = `당신은 대한민국 최고 수준의 임상 영양사 및 AI 급식 식단 분석 전문가입니다.
사용자가 제공한 급식 또는 음식 사진을 정밀하게 분석하여 각 음식의 이름, 추정 중량, 칼로리, 영양성분(탄수화물, 단백질, 지방) 및 식단의 전체적인 영양 평가를 제공하십시오.
한국인 영양섭취기준(KDRIs)과 급식 문화에 맞춰 정확하고 객관적인 수치를 추정해 주세요.`;

    // 사용자 분석 요청 프롬프트
    const prompt = `제공된 급식/음식 사진을 정밀 분석하여 다음 요청 항목들에 맞추어 정형화된 JSON 형태로 답변해 주세요:
1. items: 식판이나 접시에 담긴 각 메뉴별 객체 리스트 (name: 음식명, estimatedWeight: 추정 중량, calories: 칼로리 kcal, carbs: 탄수화물 g, protein: 단백질 g, fat: 지방 g)
2. totalNutrition: 전체 식단의 합계 객체 (totalCalories: 총 칼로리 kcal, totalCarbs: 총 탄수화물 g, totalProtein: 총 단백질 g, totalFat: 총 지방 g)
3. healthScore: 5.0 만점의 식단 종합 건강 점수 (예: 4.2)
4. scoreReason: 해당 점수를 부여한 명확한 영양학적 한 줄 이유
5. goodPoints: 식단의 영양적 장점 2~3개 리스트
6. improvementPoints: 식단의 영양적 개선점 또는 주의사항 2~3개 리스트
7. recommendations: 식단 보완을 위한 대체 음식 또는 추가 권장 식품/영양제 추천 2~3개 리스트
8. summaryAdvice: 사용자에게 전하는 영양사의 따뜻하고 전문적인 종합 조언 메세지`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  estimatedWeight: { type: "STRING" },
                  calories: { type: "NUMBER" },
                  carbs: { type: "NUMBER" },
                  protein: { type: "NUMBER" },
                  fat: { type: "NUMBER" }
                },
                required: ["name", "estimatedWeight", "calories", "carbs", "protein", "fat"]
              }
            },
            totalNutrition: {
              type: "OBJECT",
              properties: {
                totalCalories: { type: "NUMBER" },
                totalCarbs: { type: "NUMBER" },
                totalProtein: { type: "NUMBER" },
                totalFat: { type: "NUMBER" }
              },
              required: ["totalCalories", "totalCarbs", "totalProtein", "totalFat"]
            },
            healthScore: { type: "NUMBER" },
            scoreReason: { type: "STRING" },
            goodPoints: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            improvementPoints: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            recommendations: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            summaryAdvice: { type: "STRING" }
          },
          required: [
            "items",
            "totalNutrition",
            "healthScore",
            "scoreReason",
            "goodPoints",
            "improvementPoints",
            "recommendations",
            "summaryAdvice"
          ]
        }
      }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error('Gemini API Error:', errorText);
      return res.status(geminiRes.status).json({
        error: 'Gemini API 호출 중 오류가 발생했습니다.',
        details: errorText
      });
    }

    const result = await geminiRes.json();
    const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
      return res.status(500).json({ error: 'Gemini API에서 분석 결과를 생성하지 못했습니다.' });
    }

    const parsedData = JSON.parse(jsonText);
    return res.status(200).json({ success: true, data: parsedData });

  } catch (err) {
    console.error('Server Handler Error:', err);
    return res.status(500).json({
      error: '서버 내부 오류가 발생했습니다.',
      message: err.message
    });
  }
}