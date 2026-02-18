# WR-TEC Carousel Generator (Vercel)

Projeto pronto para rodar na Vercel com frontend estático (`index.html`) e função serverless (`/api/generate`).

## 1) Conectar à Vercel

1. Instale a CLI (se ainda não tiver):
   ```bash
   npm i -g vercel
   ```
2. Faça login:
   ```bash
   vercel login
   ```
3. Dentro deste diretório, vincule/crie o projeto:
   ```bash
   vercel
   ```

## 2) Configurar variável da Gemini

No dashboard da Vercel (Project Settings → Environment Variables), adicione:

- `GEMINI_API_KEY` = sua chave da API do Google Gemini

Opcional via CLI:
```bash
vercel env add GEMINI_API_KEY
```

## 3) Publicar em produção

```bash
vercel --prod
```

A Vercel retorna uma URL final no formato:

- `https://seu-projeto.vercel.app`

Esse já é o domínio deles, pronto para acessar seu site.

## 4) Teste rápido da API em produção

Depois do deploy:

```bash
curl -X POST "https://seu-projeto.vercel.app/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Marketing no Instagram","total":5}'
```

Se estiver tudo certo, retorna JSON com `slides`.
