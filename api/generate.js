import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Apenas POST é permitido
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { topic, total } = req.body;

  // Validação básica
  if (!topic || !total) {
    return res.status(400).json({ error: "Topic e total são obrigatórios" });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Usando modelo válido e atualizado
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash", // Modelo correto - gemini-3 não existe
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = `Aja como um Copywriter Sênior especializado em Instagram. 
Tema: "${topic}". 

Crie um roteiro de carrossel para Instagram com EXATAMENTE ${total} slides. 

Requisitos:
- Primeiro slide (CAPA): título em CAIXA ALTA, máximo 5 palavras
- Slides do meio: conteúdo assertivo, envolvente e educativo
- Último slide: CTA poderosa terminando SEMPRE com !

Retorne APENAS um JSON válido neste formato exato, sem markdown ou explicações:
{
  "slides": [
    { "title": "TITULO EM CAIXA ALTA", "body": "Corpo do slide com conteúdo relevante e envolvente." },
    { "title": "PROXIMO TITULO", "body": "Mais conteúdo aqui." }
  ]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Tentar fazer parse do JSON para validar
    try {
      const jsonData = JSON.parse(text);
      res.status(200).json(jsonData);
    } catch (parseError) {
      console.error("Erro ao parsear JSON do Gemini:", parseError);
      res.status(500).json({
        error: "Resposta do Gemini não é JSON válido",
        details: text.substring(0, 200),
      });
    }
  } catch (error) {
    console.error("Erro no SDK Gemini:", error);
    res.status(500).json({
      error: "Falha no processamento do Gemini",
      details: error.message,
    });
  }
}
