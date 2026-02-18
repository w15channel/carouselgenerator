import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Bloqueia qualquer coisa que não seja POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Apenas requisições POST são permitidas.' });
  }

  const { topic, total } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Chave GEMINI_API_KEY não configurada na Vercel." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", // Use o 1.5-flash para maior estabilidade enquanto o 3 está em preview
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Gere um JSON para carrossel Instagram: Tema "${topic}", ${total} slides. Formato: { "slides": [ { "title": "...", "body": "..." } ] }`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.status(200).json(JSON.parse(text));
  } catch (error) {
    console.error("Erro:", error);
    return res.status(500).json({ error: error.message });
  }
}
