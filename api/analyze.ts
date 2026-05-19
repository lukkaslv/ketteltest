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
    const { testType, scores, summary, language } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const traitsText = Object.keys(scores).map(t => `${summary[t].title}: ${scores[t]}%`).join("\\n");
    
    const langPrompt = language === 'ka' ? 'Ответь на грузинском языке.' : 'Ответь на русском языке.';

    const prompt = `Ты опытный психолог. Проанализируй результаты теста "${testType}".
Твоя задача — дать глубокую, структурированную интерпретацию. Не используй общие фразы. Опирайся на следующие показатели (в процентах от мин до макс).

Показатели:
${traitsText}

Структура ответа:
1. Ваш психологический портрет (3-4 предложения, суть характера).
2. Скрытые сильные стороны (2-3 пункта).
3. Зоны риска / на что обратить внимание (2-3 пункта, деликатно).
4. Рекомендации по карьере (какие сферы и стили работы подходят).

${langPrompt} Оформи текст красиво, с использованием markdown (заголовки, списки).`;

    const response = await generateContentWithRetry(ai, prompt);

    res.json({ analysis: response?.text });
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({ error: "Failed to generate analysis" });
  }
}
