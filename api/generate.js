// api/generate.js
// Vercel Serverless Function — Hugging Face (text) + Pollinations (image)

async function generateSlideImage({ topic, slideTitle, slideBody }) {
  const prompt = [
    `Instagram carousel background about: ${topic}`,
    `Slide focus: ${slideTitle}`,
    `Context: ${slideBody}`,
    'Style: cinematic, premium, editorial lighting, high detail',
    'No text, no letters, no logos, no watermark'
  ].join('. ');

  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1350&nologo=true&model=flux&enhance=true`;

  const imgRes = await fetch(imageUrl, {
    method: 'GET',
    headers: { Accept: 'image/*' },
  });

  if (!imgRes.ok) {
    const errText = await imgRes.text();
    throw new Error(`Erro na API de imagem (${imgRes.status}): ${errText.slice(0, 200)}`);
  }

  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw new Error(`API de imagem retornou content-type inválido: ${contentType}`);
  }

  const arrayBuffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:${contentType};base64,${base64}`;
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

    const hfData = await hfRes.json();
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
      return res.status(502).json({ error: 'A IA retornou JSON inválido para os slides.' });
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
    return res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
  }
};
