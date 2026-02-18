// api/generate.js
// Vercel Serverless Function — Google Gemini AI

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

function safeParseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeSlides(payload) {
  if (!payload) return null;
  if (Array.isArray(payload.slides)) return payload.slides;

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed.slides)) return parsed.slides;
    } catch {
      return null;
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*';

  // CORS headers (for local dev and external clients)
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'Configure GEMINI_API_KEY (ou GOOGLE_API_KEY) nas variáveis de ambiente da Vercel.' });
  }

  const { topic, total = 5 } = safeParseBody(req.body);

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "topic" é obrigatório.' });
  }

  const numSlides = Math.min(Math.max(parseInt(total, 10) || 5, 3), 10);

  const prompt = `
Você é um estrategista de conteúdo especialista em criar carrosséis virais para Instagram.
Gere um carrossel com exatamente ${numSlides} slides sobre o seguinte tema:

TEMA: ${topic.trim()}

REGRAS OBRIGATÓRIAS:
- Responda APENAS com um JSON válido, sem texto antes ou depois, sem blocos de código markdown
- Cada slide deve ter: "title" (título curto e impactante, máximo 6 palavras) e "body" (2 a 3 frases explicativas, conteúdo denso e valioso)
- O primeiro slide deve ser um gancho forte que prenda a atenção
- O último slide deve ter uma call-to-action clara (ex: seguir, salvar, comentar)
- Tom: autoridade, direto, transformador
- Idioma: Português Brasileiro

FORMATO EXATO DE RESPOSTA (sem nenhum caractere fora deste JSON):
{
  "slides": [
    { "title": "Título do Slide 1", "body": "Texto descritivo do slide 1." },
    { "title": "Título do Slide 2", "body": "Texto descritivo do slide 2." }
  ]
}
`.trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let geminiRes;
    try {
      geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return res.status(502).json({ error: `Erro de comunicação com Gemini (${geminiRes.status}).` });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error('Gemini response structure unexpected:', JSON.stringify(geminiData));
      return res.status(502).json({ error: 'Resposta inesperada da Gemini. Sem conteúdo gerado.' });
    }

    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse error. Raw text was:', rawText);
      return res.status(502).json({ error: 'A IA retornou um formato inválido. Tente novamente.' });
    }

    const slides = normalizeSlides(parsed);
    if (!slides || slides.length === 0) {
      return res.status(502).json({ error: 'Formato de slides ausente na resposta da IA.' });
    }

    return res.status(200).json({ slides });
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    if (isTimeout) {
      return res.status(504).json({ error: 'Tempo limite excedido ao comunicar com a Gemini. Tente novamente.' });
    }

    console.error('Internal error:', err);
    return res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
  }
};
