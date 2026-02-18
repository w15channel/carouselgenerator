// api/generate.js
// Vercel Serverless Function — Hugging Face (text + image)

async function generateSlideImage({ topic, slideTitle, slideBody, hfToken }) {
  const { InferenceClient } = await import('@huggingface/inference');
  const client = new InferenceClient(hfToken);

  const prompt = [
    `Instagram carousel background about: ${topic}`,
    `Slide focus: ${slideTitle}`,
    `Context: ${slideBody}`,
    'Style: cinematic, premium, editorial lighting, high detail',
    'No text, no letters, no logos, no watermark'
  ].join('. ');

  const imageBlob = await client.textToImage({
    provider: 'nscale',
    model: 'stabilityai/stable-diffusion-xl-base-1.0',
    inputs: prompt,
    parameters: { num_inference_steps: 5 },
  });

  const buffer = Buffer.from(await imageBlob.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mime = imageBlob.type || 'image/png';
  return `data:${mime};base64,${base64}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { topic, total = 5 } = req.body || {};

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "topic" é obrigatório.' });
  }

  const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  if (!HF_TOKEN) {
    return res.status(500).json({
      error: 'HF_TOKEN não configurada nas variáveis de ambiente da Vercel.',
    });
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
      console.error('Hugging Face text API error:', errText);
      return res.status(502).json({ error: `Erro na API Hugging Face (${hfRes.status}).` });
    }

    const hfRaw = await hfRes.text();
    let hfData;

    try {
      hfData = JSON.parse(hfRaw);
    } catch {
      console.error('Hugging Face text response was not JSON:', hfRaw.slice(0, 500));
      return res.status(502).json({ error: 'A API de texto retornou resposta inválida. Tente novamente em instantes.' });
    }

    const rawText = hfData?.choices?.[0]?.message?.content;

    if (!rawText) {
      console.error('Hugging Face text response unexpected:', JSON.stringify(hfData));
      return res.status(502).json({ error: 'Resposta inesperada da Hugging Face (texto).' });
    }

    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'A IA de texto retornou formato inválido para os slides. Tente novamente.' });
    }

    if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      return res.status(502).json({ error: 'Formato de slides ausente na resposta da IA.' });
    }

    const slidesWithImages = [];
    for (const slide of parsed.slides) {
      const image = await generateSlideImage({
        topic: topic.trim(),
        slideTitle: slide.title,
        slideBody: slide.body,
        hfToken: HF_TOKEN,
      });

      if (!image) {
        return res.status(502).json({ error: 'Falha ao gerar imagem para os slides.' });
      }

      slidesWithImages.push({
        ...slide,
        image,
      });
    }

    return res.status(200).json({ slides: slidesWithImages });
  } catch (err) {
    console.error('Internal error:', err);
    return res.status(500).json({ error: 'Erro interno no servidor ao processar a geração. Tente novamente.' });
  }
};
