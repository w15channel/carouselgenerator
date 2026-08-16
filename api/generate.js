// api/generate.js
// Vercel Serverless Function — geração de texto + imagens via Google GenAI (Gemini)

function cleanJsonFence(text) {
  return String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
}

function extractTextFromGeminiResponse(response) {
  if (!response) return '';

  if (typeof response.text === 'function') {
    return response.text();
  }

  if (typeof response.text === 'string') {
    return response.text;
  }

  return (
    response?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || '')
      .join('') || ''
  );
}

async function getGoogleClient(apiKey) {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey });
}

async function generateSlidesTextWithGoogle({ ai, topic, numSlides }) {
  const prompt = `
Você é um estrategista de conteúdo especialista em criar carrosséis virais para Instagram.
Gere um carrossel com exatamente ${numSlides} slides sobre o seguinte tema:
TEMA: ${topic.trim()}
REGRAS OBRIGATÓRIAS:
- Responda APENAS com um JSON válido, sem texto antes ou depois, sem blocos de código markdown
- Cada slide deve ter:
    "title" (título curto e impactante, máximo 6 palavras),
    "body" (2 a 3 frases explicativas, conteúdo denso e valioso),
    "imagePrompt" (prompt em INGLÊS, 10-15 palavras, cena fotográfica ou ilustração contextual — sem texto, sem letras, sem pessoas famosas)
- O primeiro slide deve ser um gancho forte que prenda a atenção
- O último slide deve ter uma call-to-action clara
- Tom: autoridade, direto, transformador
- Idioma dos campos title e body: Português Brasileiro
- Idioma do campo imagePrompt: Inglês
FORMATO EXATO:
{"slides":[{"title":"...","body":"...","imagePrompt":"..."}]}
`.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      temperature: 0.8,
      responseMimeType: 'application/json',
    },
  });

  const rawText = extractTextFromGeminiResponse(response);
  if (!rawText) {
    throw new Error('Resposta inesperada da IA de texto (Google).');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonFence(rawText));
  } catch {
    throw new Error('Formato inválido retornado pela IA de texto (Google).');
  }

  if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    throw new Error('Formato de slides inválido na resposta da IA (Google).');
  }

  return parsed.slides.slice(0, numSlides);
}

async function generateSlideImageWithGoogle({ ai, topic, slide }) {
  const fallbackPrompt = [
    `Instagram carousel about ${topic}`,
    `Slide focus: ${slide.title || ''}`,
    `Context: ${slide.body || ''}`,
    'Cinematic, premium, editorial lighting, high detail',
    'No text, no letters, no logos, no watermark',
  ]
    .join('. ')
    .trim();

  const prompt = (slide.imagePrompt || fallbackPrompt).trim();

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-preview-image-generation',
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part?.inlineData?.data);
  const imageData = imagePart?.inlineData?.data;
  const mimeType = imagePart?.inlineData?.mimeType || 'image/png';

  if (!imageData) {
    throw new Error('Gemini não retornou imagem para este slide.');
  }

  return `data:${mimeType};base64,${imageData}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const GOOGLE_API_KEY =
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({
      error: 'GOOGLE_API_KEY (ou GEMINI_API_KEY) não configurada nas variáveis de ambiente.',
    });
  }

  const { topic, total = 5 } = req.body || {};
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'Campo "topic" é obrigatório.' });
  }

  const numSlides = Math.min(Math.max(parseInt(total, 10) || 5, 3), 10);

  try {
    const ai = await getGoogleClient(GOOGLE_API_KEY);

    const slides = await generateSlidesTextWithGoogle({
      ai,
      topic,
      numSlides,
    });

    const images = await Promise.all(
      slides.map(async (slide) => {
        try {
          return await generateSlideImageWithGoogle({ ai, topic: topic.trim(), slide });
        } catch (err) {
          console.warn('Falha ao gerar imagem do slide:', err?.message || err);
          return null;
        }
      })
    );

    const slidesWithImages = slides.map((slide, index) => ({
      ...slide,
      image: images[index],
    }));

    return res.status(200).json({ slides: slidesWithImages });
  } catch (err) {
    console.error('Erro interno ao gerar carrossel:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Erro interno no servidor ao processar a geração.' });
  }
};
