import { GoogleGenAI } from "@google/genai";

async function generateContentWithRetry(ai: any, prompt: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response;
    } catch (error: any) {
      if (error?.status === 503 || error?.status === 'UNAVAILABLE' || (error?.message && error.message.includes('503'))) {
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { testType, userScores, partnerScores, summary, language } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const traitsList = Object.keys(userScores);
    const userTraitsText = traitsList.map(t => `${summary[t].title}: ${userScores[t]}%`).join("\\n");
    const partnerTraitsText = traitsList.map(t => `${summary[t].title}: ${partnerScores[t]}%`).join("\\n");
    
    const langPrompt = language === 'ka' ? 'Ответь на грузинском языке.' : 'Ответь на русском языке.';

    const prompt = `Ты семейный и корпоративный психолог-консультант. Проанализируй совместимость двух людей по результатам теста "${testType}".

Профиль первого человека (Пользователь):
${userTraitsText}

Профиль второго человека (Партнер):
${partnerTraitsText}

Структура ответа (Обращайся к Пользователю):
1. Сильные стороны вашей пары (в чем вы дополняете друг друга).
2. Возможные зоны риска и конфликтов (где вы принципиально разные).
3. Как улучшить взаимодействие (короткий совет).

${langPrompt} Оформи текст красиво, с использованием markdown (заголовки, списки). Не используй слишком длинные описания, будь конкретен.`;

    const response = await generateContentWithRetry(ai, prompt);

    res.json({ analysis: response?.text });
  } catch (error) {
    console.error("Compatibility error:", error);
    res.status(500).json({ error: "Failed to generate compatibility analysis" });
  }
}
