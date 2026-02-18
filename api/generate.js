// api/generate.js
// Vercel Serverless Function — Hugging Face Inference API (texto + imagem)
const { InferenceClient } = require("@huggingface/inference");

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido. Use POST.' });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return res.status(500).json({ error: 'HF_TOKEN não configurada nas variáveis de ambiente da Vercel.' });

  const { topic, total = 5 } = req.body || {};
  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "topic" é obrigatório.' });
  }

  const numSlides = Math.min(Math.max(parseInt(total, 10) || 5, 3), 10);
  const client = new InferenceClient(HF_TOKEN);

  // ─── 1. GERAR TEXTO DOS SLIDES ────────────────────────────────────────────
  const prompt = `
Você é um estrategista de conteúdo especialista em criar carrosséis virais para Instagram.
Gere um carrossel com exatamente ${numSlides} slides sobre o seguinte tema:
TEMA: ${topic.trim()}
REGRAS OBRIGATÓRIAS:
- Responda APENAS com um JSON válido, sem texto antes ou depois, sem blocos de código markdown
- Cada slide deve ter:
    "title" (título curto e impactante, máximo 6 palavras),
    "body" (2 a 3 frases explicativas, conteúdo denso e valioso),
    "imagePrompt" (prompt em INGLÊS, 10-15 palavras, descrevendo uma cena fotográfica ou ilustração que represente visualmente o conteúdo do slide — sem texto, sem letras, sem pessoas famosas)
- O primeiro slide deve ser um gancho forte que prenda a atenção
- O último slide deve ter uma call-to-action clara (ex: seguir, salvar, comentar)
- Tom: autoridade, direto, transformador
- Idioma dos campos title e body: Português Brasileiro
- Idioma do campo imagePrompt: Inglês
FORMATO EXATO DE RESPOSTA:
{
  "slides": [
    { "title": "...", "body": "...", "imagePrompt": "..." }
  ]
}
`.trim();

  let slides;
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
      console.error('HF text error:', errText);
      return res.status(502).json({ error: `Erro na API de texto Hugging Face (${hfRes.status}).` });
    }

    const hfData = await hfRes.json();
    const rawText = hfData?.choices?.[0]?.message?.content;
    if (!rawText) return res.status(502).json({ error: 'Sem conteúdo gerado pela IA de texto.' });

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return res.status(502).json({ error: 'Formato de slides ausente na resposta da IA.' });
    }

    slides = parsed.slides;
  } catch (err) {
    console.error('Erro na geração de texto:', err);
    return res.status(500).json({ error: 'Erro ao gerar texto: ' + err.message });
  }

  // ─── 2. GERAR IMAGENS EM PARALELO (Replicate + SDXL-Lightning) ───────────
  async function generateImage(imagePrompt) {
    try {
      const imageBlob = await client.textToImage({
        provider: 'replicate',
        model: 'ByteDance/SDXL-Lightning',
        inputs: imagePrompt + ', cinematic lighting, high quality, photorealistic, no text, no letters',
        parameters: { num_inference_steps: 5 },
      });

      // Converte o Blob retornado para base64
      const arrayBuffer = await imageBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = imageBlob.type || 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      console.warn(`Imagem falhou para prompt "${imagePrompt}":`, err.message);
      return null; // fallback tratado no frontend
    }
  }

  // Dispara todas as gerações de imagem ao mesmo tempo
  const imagePromises = slides.map((slide) =>
    generateImage(slide.imagePrompt || `${topic} abstract visual concept`)
  );
  const images = await Promise.all(imagePromises);

  // Mescla imagem em cada slide
  const slidesWithImages = slides.map((slide, i) => ({
    ...slide,
    image: images[i], // base64 string ou null
  }));

  return res.status(200).json({ slides: slidesWithImages });
};
