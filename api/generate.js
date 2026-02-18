// api/generate.js
// Vercel Serverless Function — geração de texto + imagens via Hugging Face

const { InferenceClient } = require('@huggingface/inference');

function cleanJsonFence(text) {
  return String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
}

async function generateSlideImage({ client, topic, slide }) {
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

  const imageBlob = await client.textToImage({
    provider: 'fal-ai',
    model: 'Qwen/Qwen-Image-2512',
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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const HF_TOKEN =
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HF_API_KEY;

  if (!HF_TOKEN) {
    return res
      .status(500)
      .json({ error: 'HF_TOKEN não configurada nas variáveis de ambiente.' });
  }

  const { topic, total = 5 } = req.body || {};
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'Campo "topic" é obrigatório.' });
  }

  const numSlides = Math.min(Math.max(parseInt(total, 10) || 5, 3), 10);
  const client = new InferenceClient(HF_TOKEN);

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
          { role: 'system', content: 'Você responde sempre com JSON válido e sem markdown.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 2048,
      }),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error('Hugging Face text API error:', errText);
      return res.status(502).json({ error: `Erro na API de texto (${hfRes.status}).` });
    }

    const hfData = await hfRes.json();
    const rawText = hfData?.choices?.[0]?.message?.content;
    if (!rawText) {
      return res.status(502).json({ error: 'Resposta inesperada da IA de texto.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanJsonFence(rawText));
    } catch {
      console.error('Texto retornado pela IA não era JSON válido.');
      return res.status(502).json({ error: 'Formato inválido retornado pela IA de texto.' });
    }

    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      return res.status(502).json({ error: 'Formato de slides inválido na resposta da IA.' });
    }

    const slides = parsed.slides.slice(0, numSlides);
    const images = await Promise.all(
      slides.map(async (slide) => {
        try {
          return await generateSlideImage({ client, topic: topic.trim(), slide });
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
      .json({ error: 'Erro interno no servidor ao processar a geração.' });
  }
};
