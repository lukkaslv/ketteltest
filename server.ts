import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function generateContentWithRetry(ai: GoogleGenAI, prompt: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response;
    } catch (error: any) {
      if (error?.status === 503 || error?.status === 'UNAVAILABLE' || (error?.message && error.message.includes('503'))) {
        console.warn(`Attempt ${i + 1} failed with 503. Retrying in 2 seconds...`);
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for individual profile analysis
  app.post("/api/analyze", async (req, res) => {
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
  });

  // API Route for compatibility analysis
  app.post("/api/compatibility", async (req, res) => {
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
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
