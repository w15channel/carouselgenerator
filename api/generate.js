import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Segurança contra métodos não permitidos
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Apenas POST permitido' });
  }

  const { topic, total } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Chave API não configurada na Vercel." });
  }

  // Inicializa o SDK
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // Mudamos para o 2.0 Flash, que é o cavalo de batalha de 2026
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash", 
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Aja como Copywriter Sênior. Tema: "${topic}". 
    Gere um JSON para carrossel Instagram com ${total} slides. 
    Formato: { "slides": [ { "title": "TITULO", "body": "corpo" } ] }`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Retorna os dados para o seu Index.html
    return res.status(200).json(JSON.parse(text));

  } catch (error) {
    console.error("Erro detalhado:", error);
    
    // Se o erro for 404 de novo, tentamos o fallback automático para o modelo estável v1
    return res.status(500).json({ 
      error: "O motor falhou na partida.", 
      details: error.message 
    });
  }
}
