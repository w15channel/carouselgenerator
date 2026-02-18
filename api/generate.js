import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  const { topic, total } = req.body;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  try {
    // Configurando o motor Gemini 3
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Aja como um Copywriter Sênior. Tema: "${topic}". 
    Crie um roteiro de carrossel para Instagram com ${total} slides. 
    Estrutura: Capa em CAIXA ALTA, conteúdo assertivo, e o último slide com uma CTA poderosa terminando em !. 
    Retorne o JSON neste formato: { "slides": [ { "title": "...", "body": "..." } ] }`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Enviando a resposta limpa para o seu HTML
    res.status(200).json(text);

  } catch (error) {
    console.error("Erro no SDK Gemini:", error);
    res.status(500).json({ error: "Falha no processamento do Gemini 3." });
  }
}
