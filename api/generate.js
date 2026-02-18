import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Apenas POST é permitido
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { topic, total } = req.body;

  // Validação básica
  if (!topic || !total) {
    return res.status(400).json({ 
      error: "Topic e total são obrigatórios" 
    });
  }

  try {
    // Verificar se a chave API existe
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey.trim() === "") {
      console.error("❌ GEMINI_API_KEY não configurada no Vercel!");
      return res.status(500).json({ 
        error: "Chave API Gemini não configurada",
        hint: "Configure GEMINI_API_KEY em Settings → Environment Variables no Vercel"
      });
    }

    console.log("✅ Chave API encontrada. Comprimento:", apiKey.length);

    // Inicializar Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    // Usar modelo Gemini 2.0 Flash (mais rápido e barato)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // Prompt otimizado para gerar JSON consistente
    const prompt = `Aja como um Copywriter Sênior especializado em Instagram. 
Tema: "${topic}". 

Crie um roteiro de carrossel para Instagram com EXATAMENTE ${total} slides.

Requisitos OBRIGATÓRIOS:
- Primeiro slide: título em CAIXA ALTA (máximo 5 palavras)
- Slides do meio: conteúdo assertivo, envolvente e educativo
- Último slide: CTA poderosa terminando SEMPRE com "!"
- Todos os slides devem ser relevantes ao tema

Retorne APENAS um JSON válido, sem markdown, sem explicações:
{
  "slides": [
    { "title": "TITULO EM CAIXA ALTA", "body": "Corpo do slide com conteúdo relevante e envolvente." },
    { "title": "PROXIMO TITULO", "body": "Mais conteúdo aqui." }
  ]
}`;

    console.log(`📤 Enviando requisição para Gemini com tema: "${topic}" (${total} slides)`);

    // Gerar conteúdo
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("✅ Resposta recebida do Gemini");

    // Fazer parse do JSON
    try {
      const jsonData = JSON.parse(text);
      
      // Validar estrutura
      if (!jsonData.slides || !Array.isArray(jsonData.slides)) {
        throw new Error("Resposta não contém array 'slides'");
      }

      console.log(`✅ JSON válido com ${jsonData.slides.length} slides`);
      
      // Retornar sucesso
      return res.status(200).json(jsonData);

    } catch (parseError) {
      console.error("❌ Erro ao parsear JSON do Gemini:", parseError.message);
      
      // Tentar extrair JSON se estiver em markdown
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[1]);
          console.log("✅ JSON extraído com sucesso do markdown");
          return res.status(200).json(extracted);
        } catch (e) {
          console.error("❌ JSON extraído mas inválido");
        }
      }

      return res.status(500).json({
        error: "Resposta do Gemini não é JSON válido",
        details: text.substring(0, 300),
        parseError: parseError.message
      });
    }

  } catch (error) {
    console.error("❌ Erro Geral:", error.message);
    
    // Detectar tipo de erro
    let errorMessage = "Falha no processamento do Gemini";
    let errorDetails = error.message;

    if (error.message.includes("429")) {
      errorMessage = "Quota excedida. Aguarde alguns minutos e tente novamente.";
    } else if (error.message.includes("401") || error.message.includes("unauthorized")) {
      errorMessage = "Chave API inválida ou expirada. Verifique no Vercel.";
    } else if (error.message.includes("ECONNREFUSED")) {
      errorMessage = "Erro de conexão com o servidor do Gemini.";
    }

    return res.status(500).json({
      error: errorMessage,
      details: errorDetails,
      type: error.constructor.name
    });
  }
}
