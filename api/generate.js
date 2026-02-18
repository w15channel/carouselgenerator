// api/generate.js
// Vercel Serverless Function — Hugging Face Inference API (with local fallback)

function buildFallbackSlides(topic, total) {
  const safeTopic = String(topic || '').trim();

  const base = [
    {
      title: `Por que ${safeTopic} importa`,
      body: `Se você ignora ${safeTopic}, perde eficiência e resultado. Este carrossel vai direto ao ponto com ações práticas para aplicar hoje.`
    },
    {
      title: 'Erro comum que trava tudo',
      body: `A maioria começa sem objetivo e sem métrica. Em ${safeTopic}, isso gera retrabalho e baixa consistência nos resultados.`
    },
    {
      title: 'Estratégia simples e forte',
      body: `Defina um objetivo claro, uma rotina curta e um indicador principal. Isso dá foco e acelera progresso em ${safeTopic}.`
    },
    {
      title: 'Plano de execução em 3 passos',
      body: `1) Diagnóstico rápido. 2) Priorização do que gera impacto. 3) Revisão semanal para ajustar rota sem perder ritmo.`
    },
    {
      title: 'Comece hoje mesmo',
      body: `Escolha uma ação prática agora e execute em 24h. Salve este conteúdo e compartilhe com alguém que precisa destravar ${safeTopic}.`
    }
  ];

  if (total <= base.length) return base.slice(0, total);

  const extended = [...base];
  while (extended.length < total) {
    extended.splice(extended.length - 1, 0, {
      title: `Aplique em ${safeTopic}`,
      body: `Transforme teoria em rotina com constância. Pequenas melhorias frequentes em ${safeTopic} vencem grandes planos nunca executados.`
    });
  }

  return extended.slice(0, total);
}


async function generateSlideImage(topic, hfToken) {
  try {
    const { InferenceClient } = await import('@huggingface/inference');
    const client = new InferenceClient(hfToken);

    const prompt = `Cinematic editorial background for an Instagram carousel about: ${topic}. No text, no logos, modern and premium style.`;

    const imageBlob = await client.textToImage({
      provider: 'fal-ai',
      model: 'stabilityai/stable-diffusion-3.5-large',
      inputs: prompt,
      parameters: { num_inference_steps: 5 },
    });

    const buffer = Buffer.from(await imageBlob.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mime = imageBlob.type || 'image/png';
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.error('Image generation error:', err?.message || err);
    return null;
  }
}

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

  const { topic, total = 5 } = req.body || {};

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "topic" é obrigatório.' });
  }

  const numSlides = Math.min(Math.max(parseInt(total, 10) || 5, 3), 10);
  const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;

  if (!HF_TOKEN) {
    return res.status(200).json({
      slides: buildFallbackSlides(topic, numSlides),
      image: null,
      warning: 'HF token ausente. Conteúdo gerado em modo local (fallback). Configure HF_TOKEN para usar IA externa.'
    });
  }

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
      return res.status(200).json({
        slides: buildFallbackSlides(topic, numSlides),
        image: null,
        warning: `Falha na Hugging Face (${hfRes.status}). Conteúdo gerado em modo local (fallback).`
      });
    }

    const hfData = await hfRes.json();
    const rawText = hfData?.choices?.[0]?.message?.content;

    if (!rawText) {
      console.error('Hugging Face response structure unexpected:', JSON.stringify(hfData));
      return res.status(200).json({
        slides: buildFallbackSlides(topic, numSlides),
        image: null,
        warning: 'Resposta inesperada da Hugging Face. Conteúdo gerado em modo local (fallback).'
      });
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
      return res.status(200).json({
        slides: buildFallbackSlides(topic, numSlides),
        image: null,
        warning: 'A IA retornou formato inválido. Conteúdo gerado em modo local (fallback).'
      });
    }

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return res.status(200).json({
        slides: buildFallbackSlides(topic, numSlides),
        image: null,
        warning: 'Formato de slides ausente na resposta da IA. Conteúdo gerado em modo local (fallback).'
      });
    }

    const image = await generateSlideImage(topic.trim(), HF_TOKEN);
    return res.status(200).json({
      slides: parsed.slides,
      image,
      warning: image ? undefined : 'Não foi possível gerar imagem com Hugging Face. Usando imagem padrão.'
    });
  } catch (err) {
    console.error('Internal error:', err);
    return res.status(200).json({
      slides: buildFallbackSlides(topic, numSlides),
      image: null,
      warning: 'Erro interno ao acessar IA externa. Conteúdo gerado em modo local (fallback).'
    });
  }
};
