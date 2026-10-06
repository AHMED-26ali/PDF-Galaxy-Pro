import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json({ limit: '20mb' }));

// Server-side Gemini initialization
const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// API: Chatbot
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ parts: [{ text: message }] }],
    });
    return res.json({ text: response.text?.trim() || '' });
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate chat response' });
  }
});

// API: Convert Text to Word-compatible HTML
app.post('/api/gemini/convert-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }
    const ai = getAi();
    const prompt = `
        قم بتنسيق النص التالي إلى HTML أساسي. استخدم علامات دلالية مثل <h1> و <h2> و <p> و <strong> لتنظيم المحتوى.
        لا تقم بتضمين علامات <html> أو <head> أو <body>. يجب أن يكون الإخراج فقط هو المحتوى الذي يوضع داخل وسم <body>.
        النص باللغة العربية، لذا حافظ على بنيته.
        النص المراد تنسيقه هو:
        \n\n${text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
      },
    });

    let bodyContent = response.text?.trim() || '';
    bodyContent = bodyContent.replace(/^```html\n?/, '').replace(/\n?```$/, '');
    return res.json({ html: bodyContent });
  } catch (error: any) {
    console.error('Convert text error:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert text to HTML' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
