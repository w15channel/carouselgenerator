// api/generate.js
// Vercel Serverless Function — Hugging Face Inference API

module.exports = async function handler(req, res) {
  // CORS headers (for local dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'HF_TOKEN não configurada nas variáveis de ambiente da Vercel.' });
  }

  const { topic, total = 5 } = req.body || {};

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
    const hfRes = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'nebius',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        messages: [
          {
            role: 'system',
            content: 'Você responde sempre com JSON válido e sem markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 2048,
      }),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error('Hugging Face API error:', errText);
      return res.status(502).json({ error: `Erro na API Hugging Face (${hfRes.status}).` });
    }

    const hfData = await hfRes.json();
    const rawText = hfData?.choices?.[0]?.message?.content;

    if (!rawText) {
      console.error('Hugging Face response structure unexpected:', JSON.stringify(hfData));
      return res.status(502).json({ error: 'Resposta inesperada da Hugging Face. Sem conteúdo gerado.' });
    }

    // Strip any potential markdown code fences
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error. Raw text was:', rawText);
      return res.status(502).json({ error: 'A IA retornou um formato inválido. Tente novamente.' });
    }

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return res.status(502).json({ error: 'Formato de slides ausente na resposta da IA.' });
    }

    return res.status(200).json({ slides: parsed.slides });
  } catch (err) {
    console.error('Internal error:', err);
    return res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
  }
};
