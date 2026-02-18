// api/generate.js
export default async function handler(req, res) {
  const { topic, total } = req.body;
  const apiKey = process.env.GEMINI_API_KEY; 

  if (!apiKey) {
    return res.status(500).json({ error: "Chave GEMINI_API_KEY não encontrada na Vercel." });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Aja como um Copywriter Sênior. Tema: "${topic}". 
            Crie um roteiro de carrossel para Instagram com ${total} slides. 
            Regras: Capa em CAIXA ALTA, conteúdo sem reticências, e o último slide deve ser uma CTA poderosa terminando em !. 
            Retorne APENAS um JSON no formato: { "slides": [ { "title": "...", "body": "..." } ] }`
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();
    
    // O Gemini retorna o conteúdo dentro de uma estrutura específica
    const content = data.candidates[0].content.parts[0].text;
    res.status(200).json(content);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro interno no motor Gemini." });
  }
}
