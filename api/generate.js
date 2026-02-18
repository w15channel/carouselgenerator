// api/generate.js
export default async function handler(req, res) {
  const { topic, total } = req.body;
  const apiKey = process.env.GROQ_API_KEY; // Aqui ele puxa a chave que você salvou na Vercel

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Modelo ultra-rápido da Groq
        messages: [
          {
            role: "system",
            content: "Você é um Copywriter Sênior. Responda apenas com JSON puro."
          },
          {
            role: "user",
            content: `Crie um roteiro de carrossel com ${total} slides sobre: "${topic}". Estrutura: Capa chamativa, conteúdo direto sem reticências, e CTA final com !. Retorne JSON: { "background_prompt": "descrição da imagem", "slides": [{ "title": "...", "body": "..." }] }`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    res.status(200).json(data.choices[0].message.content);
  } catch (error) {
    res.status(500).json({ error: "Erro no processamento da Groq" });
  }
}
