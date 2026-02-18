import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  console.log("=== REQUISIÇÃO RECEBIDA ===");
  console.log("Método:", req.method);
  console.log("Body:", JSON.stringify(req.body, null, 2));

  // Apenas POST é permitido
  if (req.method !== "POST") {
    console.log("❌ Método não é POST");
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { topic, total } = req.body;

  // Validação básica
  if (!topic || !total) {
    console.log("❌ Topic ou total faltando");
    return res.status(400).json({ 
      error: "Topic e total são obrigatórios",
      received: { topic, total }
    });
  }

  console.log("✅ Validação básica passou");
  console.log("Topic:", topic);
  console.log("Total de slides:", total);

  try {
    // Verificar se a chave API existe
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("=== CHECANDO API KEY ===");
    console.log("Chave API existe?", !!apiKey);
    console.log("Chave (primeiros 10 chars):", apiKey ? apiKey.substring(0, 10) + "..." : "NÃO EXISTE");

    if (!apiKey) {
      console.log("❌ GEMINI_API_KEY não está configurada!");
      return res.status(500).json({ 
        error: "Chave API Gemini não configurada",
        hint: "Configure GEMINI_API_KEY nas variáveis de ambiente do Vercel"
      });
    }

    console.log("=== INICIALIZANDO GEMINI ===");
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("✅ GoogleGenerativeAI instanciado");

    console.log("=== CARREGANDO MODELO ===");
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    console.log("✅ Modelo carregado: gemini-2.0-flash");

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

    console.log("=== ENVIANDO PROMPT ===");
    console.log("Tamanho do prompt:", prompt.length, "caracteres");
    
    const result = await model.generateContent(prompt);
    console.log("✅ Resposta recebida do Gemini");

    const response = await result.response;
    console.log("✅ Response object obtido");

    const text = response.text();
    console.log("=== RESPOSTA DO GEMINI ===");
    console.log("Tamanho da resposta:", text.length, "caracteres");
    console.log("Primeiros 200 caracteres:", text.substring(0, 200));

    // Tentar fazer parse do JSON
    console.log("=== PARSEANDO JSON ===");
    try {
      const jsonData = JSON.parse(text);
      console.log("✅ JSON parseado com sucesso");
      console.log("Número de slides:", jsonData.slides ? jsonData.slides.length : "undefined");
      
      // Validar estrutura
      if (!jsonData.slides || !Array.isArray(jsonData.slides)) {
        throw new Error("Propriedade 'slides' não é um array");
      }
      
      if (jsonData.slides.length !== total) {
        console.warn(`⚠️ Número de slides diferente: esperado ${total}, recebido ${jsonData.slides.length}`);
      }

      console.log("=== SUCESSO ===");
      res.status(200).json(jsonData);
    } catch (parseError) {
      console.log("❌ ERRO AO PARSEAR JSON");
      console.log("Erro:", parseError.message);
      console.log("Tentando extrair JSON da resposta...");
      
      // Tentar extrair JSON se estiver envolvido em markdown
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        console.log("Found JSON in markdown, extracting...");
        try {
          const extracted = JSON.parse(jsonMatch[1]);
          console.log("✅ JSON extraído com sucesso do markdown");
          res.status(200).json(extracted);
          return;
        } catch (e) {
          console.log("❌ Falha ao parsear JSON extraído");
        }
      }

      console.log("Resposta completa do Gemini:");
      console.log(text);

      res.status(500).json({
        error: "Resposta do Gemini não é JSON válido",
        details: text.substring(0, 500),
        parseError: parseError.message
      });
    }
  } catch (error) {
    console.log("❌ ERRO GERAL");
    console.log("Tipo de erro:", error.constructor.name);
    console.log("Mensagem:", error.message);
    console.log("Stack:", error.stack);

    // Erros comuns do Gemini
    if (error.message.includes("API_KEY")) {
      console.log("💡 Dica: Problema com a chave API");
    } else if (error.message.includes("429")) {
      console.log("💡 Dica: Rate limit excedido");
    } else if (error.message.includes("500")) {
      console.log("💡 Dica: Erro do servidor do Gemini");
    }

    res.status(500).json({
      error: "Falha no processamento do Gemini",
      details: error.message,
      type: error.constructor.name
    });
  }
}
