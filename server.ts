import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json({ limit: '60mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Real PDF Password Protection & Encryption endpoint
app.post('/api/pdf/protect', async (req, res) => {
  const { pdfBase64, userPassword, ownerPassword, permissions } = req.body;
  if (!pdfBase64 || !userPassword) {
    return res.status(400).json({ error: 'Missing required pdf data or password' });
  }

  const randId = Math.random().toString(36).substring(2, 9);
  const inPath = path.join(os.tmpdir(), `encrypt_in_${randId}.pdf`);
  const outPath = path.join(os.tmpdir(), `encrypt_out_${randId}.pdf`);

  try {
    const inputBuffer = Buffer.from(pdfBase64, 'base64');
    await fs.promises.writeFile(inPath, inputBuffer);

    const actualOwner = ownerPassword || userPassword + '_owner';
    const gsArgs = [
      '-sDEVICE=pdfwrite',
      '-dPDFSETTINGS=/prepress',
      `-sOwnerPassword=${actualOwner}`,
      `-sUserPassword=${userPassword}`,
      '-dEncryptionR=3',
      '-dKeyLength=128',
    ];

    // Compute permissions if specified
    if (permissions) {
      let permValue = -4; // default permissions
      // If user wants specific restrictions
      if (permissions.allowPrinting === false) {
        permValue &= ~4;
      }
      if (permissions.allowCopying === false) {
        permValue &= ~16;
      }
      if (permissions.allowModifying === false) {
        permValue &= ~8;
      }
      gsArgs.push(`-dPermissions=${permValue}`);
    }

    gsArgs.push(`-o`, outPath, inPath);

    await execFileAsync('gs', gsArgs);

    const protectedBytes = await fs.promises.readFile(outPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(protectedBytes);
  } catch (err: any) {
    console.error('PDF encryption failed:', err);
    res.status(500).json({ error: 'Failed to encrypt PDF: ' + (err.message || 'Unknown error') });
  } finally {
    // Cleanup temporary files
    try { if (fs.existsSync(inPath)) await fs.promises.unlink(inPath); } catch {}
    try { if (fs.existsSync(outPath)) await fs.promises.unlink(outPath); } catch {}
  }
});

// In-memory / temporary store for QR-linked images
const qrImageStore = new Map<string, { buffer: Buffer; mimeType: string; filename: string; title?: string; uploadedAt: number }>();

// Upload image to generate a QR Code link that opens publicly anywhere in the world without Google Studio redirect
app.post('/api/qr-image', async (req, res) => {
  const { imageBase64, mimeType = 'image/png', filename = 'image.png', title = 'صورة مشاركة' } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing imageBase64' });
  }

  const id = Math.random().toString(36).substring(2, 10);
  const buffer = Buffer.from(imageBase64, 'base64');
  qrImageStore.set(id, { buffer, mimeType, filename, title, uploadedAt: Date.now() });

  let publicUrl: string | null = null;

  // 1. Try Litterbox public CDN (Direct openable file on any phone)
  try {
    const blob = new Blob([buffer], { type: mimeType });
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '72h');
    fd.append('fileToUpload', blob, filename || 'image.png');

    const cdnRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      body: fd,
    });
    const resultUrl = (await cdnRes.text()).trim();
    if (resultUrl.startsWith('http')) {
      publicUrl = resultUrl;
    }
  } catch (err) {
    console.warn('Litterbox upload error:', err);
  }

  // 2. Try tmpfiles public CDN if litterbox failed
  if (!publicUrl) {
    try {
      const blob = new Blob([buffer], { type: mimeType });
      const fd = new FormData();
      fd.append('file', blob, filename || 'image.png');
      const cdnRes = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: fd,
      });
      const data = await cdnRes.json();
      if (data.status === 'success' && data.data && data.data.url) {
        publicUrl = data.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
      }
    } catch (err) {
      console.warn('Tmpfiles upload error:', err);
    }
  }

  res.json({
    id,
    publicUrl: publicUrl || `/raw-img/${id}`,
    isPublicCdn: Boolean(publicUrl),
    viewUrl: publicUrl || `/img/${id}`,
    rawUrl: publicUrl || `/raw-img/${id}`,
  });
});

// Serve raw image binary
app.get('/raw-img/:id', (req, res) => {
  const item = qrImageStore.get(req.params.id);
  if (!item) {
    return res.status(404).send('Image not found');
  }
  res.setHeader('Content-Type', item.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(item.buffer);
});

// Serve beautiful mobile-friendly image viewer page for scanned QR codes
app.get('/img/:id', (req, res) => {
  const item = qrImageStore.get(req.params.id);
  if (!item) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head><meta charset="UTF-8"><title>الصورة غير موجودة</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 text-center font-sans">
        <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-sm">
          <div class="text-4xl mb-3">🔍</div>
          <h2 class="text-xl font-bold text-slate-800">الصورة غير متوفرة</h2>
          <p class="text-slate-500 text-xs mt-2">قد تكون الصورة منتهية الصلاحية أو تم حذفها.</p>
        </div>
      </body>
      </html>
    `);
  }

  const title = item.title || 'صورة ممسوحة عبر QR Code';
  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>body { font-family: 'Cairo', sans-serif; }</style>
    </head>
    <body class="bg-slate-900 text-white min-h-screen flex flex-col justify-between">
      <!-- Header -->
      <header class="p-4 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">📸</span>
          <h1 class="text-sm font-bold truncate max-w-[200px] sm:max-w-md">${title}</h1>
        </div>
        <a href="/raw-img/${req.params.id}" download="${item.filename}" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
          <span>⬇️</span>
          <span>تحميل الصورة</span>
        </a>
      </header>

      <!-- Main Image View -->
      <main class="flex-1 flex items-center justify-center p-4">
        <div class="max-w-4xl max-h-[80vh] flex items-center justify-center">
          <img src="/raw-img/${req.params.id}" alt="${title}" class="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-slate-800" />
        </div>
      </main>

      <!-- Footer -->
      <footer class="p-3 text-center text-xs text-slate-500 border-t border-slate-800/60">
        تمت المشاركة والمسح عبر منصة <span class="font-bold text-slate-400">PDF Galaxy Pro</span>
      </footer>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Specific handler for Sejda PDF Editor page to inject base href and hide headers
app.get('/sejda-proxy/pdf-editor', async (req, res) => {
  try {
    const response = await fetch('https://www.sejda.com/pdf-editor', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      }
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch editor');
    }

    let html = await response.text();

    // Set base href to /sejda-proxy/ so all assets and APIs route through our reverse proxy
    html = html.replace('<head>', '<head><base href="/sejda-proxy/">');

    // Clean integrated styling
    const customStyle = `
      <style>
        header.site-header, footer.site-footer, .site-header, .site-footer, 
        .navbar, .cookies-consent, .user-banner, .footer-section, .feedback-widget {
          display: none !important;
        }
        body {
          background-color: #f8fafc !important;
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
      </style>
    `;
    html = html.replace('</head>', `${customStyle}</head>`);

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Error serving Sejda editor HTML:', err);
    res.status(500).send('Error loading editor');
  }
});

// Proxy all other assets (/sejda-proxy/*) to sejda.com
app.use(
  '/sejda-proxy',
  createProxyMiddleware({
    target: 'https://www.sejda.com',
    changeOrigin: true,
    pathRewrite: {
      '^/sejda-proxy': '',
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    on: {
      proxyRes: (proxyRes) => {
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
      },
    },
  })
);

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
