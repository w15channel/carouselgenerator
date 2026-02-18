// api/generate.js — Texto + Imagens juntos (Promise.all com timeout por imagem)
const { InferenceClient } = require("@huggingface/inference");

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return res.status(500).json({ error: 'HF_TOKEN não configurada.' });

  const { topic, total = 5 } = req.body || {};
  if (!topic || typeof topic !== 'string' || topic.trim().length === 0)
    return res.status(400).json({ error: 'Campo "topic" é obrigatório.' });

  const numSlides = Math.min(Math.max(parseInt(total, 10) || 5, 3), 10);
  const client = new InferenceClient(HF_TOKEN);

  // ─── 1. GERAR TEXTO ───────────────────────────────────────────────────────
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

  let slides;
  try {
    const hfRes = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
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
      return res.status(502).json({ error: `Erro na API de texto (${hfRes.status}).` });
    }

    const hfData = await hfRes.json();
    const rawText = hfData?.choices?.[0]?.message?.content;
    if (!rawText) return res.status(502).json({ error: 'Sem conteúdo gerado.' });

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.slides || !Array.isArray(parsed.slides))
      return res.status(502).json({ error: 'Formato de slides inválido.' });

    slides = parsed.slides;
  } catch (err) {
    console.error('Erro generate texto:', err);
    return res.status(500).json({ error: 'Erro ao gerar texto: ' + err.message });
  }

  // ─── 2. GERAR IMAGENS EM PARALELO (com timeout individual de 7s) ──────────
  async function generateImage(imagePrompt) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 7000)
    );

    const generation = client.textToImage({
      provider: 'nscale',
      model: 'stabilityai/stable-diffusion-xl-base-1.0',
      inputs: imagePrompt + ', cinematic lighting, high quality, photorealistic, no text, no letters',
      parameters: { num_inference_steps: 5 },
    });

    try {
      const imageBlob = await Promise.race([generation, timeout]);
      const arrayBuffer = await imageBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = imageBlob.type || 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      console.warn(`Imagem falhou (${err.message}) para: "${imagePrompt}"`);
      return null; // frontend usa fallback
    }
  }

  const images = await Promise.all(
    slides.map((slide) => generateImage(slide.imagePrompt || topic))
  );

  const slidesWithImages = slides.map((slide, i) => ({
    ...slide,
    image: images[i],
  }));

  return res.status(200).json({ slides: slidesWithImages });
};
