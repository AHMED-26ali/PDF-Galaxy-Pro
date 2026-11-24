import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:4173';
const server = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'inherit' });
let browser;
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const r = await fetch(BASE + '/tools/compress'); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Local test server did not start');
}
try {
  await ready();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  // Produce an actual raster-only PDF using browser canvas + pdf-lib,
  // including a full-page background image that cannot simply be dropped.
  await page.goto(BASE + '/tools/compress', { waitUntil: 'domcontentloaded' });
  const pngB64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1300; canvas.height = 1700;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111'; ctx.font = 'bold 46px sans-serif';
    ctx.fillText('Service Manifest Scanned Document', 55, 130);
    ctx.font = '26px sans-serif';
    for (let i = 0; i < 27; i++) {
      ctx.fillText('Item ' + i + '  -  Number ' + (100000 + i * 101), 70, 235 + i * 49);
      ctx.strokeStyle = '#9bb5d0'; ctx.strokeRect(45, 195 + i * 49, 1185, 44);
    }
    // Real scanned files contain noise and colour patches, which are expensive in PNG.
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let seed = 4397;
    for (let pixel = 0; pixel < data.data.length; pixel += 4 * 9) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const noise = (seed >>> 0) % 90;
      const channel = pixel;
      data.data[channel] = Math.max(0, data.data[channel] - noise);
      data.data[channel + 1] = Math.max(0, data.data[channel + 1] - noise);
      data.data[channel + 2] = Math.max(0, data.data[channel + 2] - noise);
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const imageBytes = Buffer.from(pngB64, 'base64');
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(imageBytes);
  const paper = doc.addPage([595.28, 841.89]);
  paper.drawImage(png, { x: 0, y: 0, width: 595.28, height: 841.89 });
  const pdfBytes = await doc.save();
  assert(pdfBytes.length > 100000, 'Fixture PDF is unexpectedly small');

  const sizeResults = [];
  for (const [level, name] of [['low','خفيف (أعلى جودة)'], ['medium','متوازن (موصى به)'], ['high','أقصى ضغط']]) {
    await page.goto(BASE + '/tools/compress', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'scanned-manifest.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes)
    });
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: /بدء ضغط/ }).click();
    await page.getByRole('heading', { name: 'نتائج ضغط الملفات' }).waitFor({ timeout: 90000 });
    const dlButton = page.getByRole('button', { name: /تحميل النسخة المضغوطة/ });
    await dlButton.waitFor({ timeout: 10000 });
    const [download] = await Promise.all([page.waitForEvent('download'), dlButton.click()]);
    const resultBytes = await readFile(await download.path());
    const output = await PDFDocument.load(resultBytes);
    assert.equal(output.getPageCount(), 1, 'Page count altered');
    assert.equal(Math.round(output.getPage(0).getWidth()), 595, 'Page width altered');
    assert.equal(Math.round(output.getPage(0).getHeight()), 842, 'Page height altered');
    assert(resultBytes.length < pdfBytes.length * 0.85, level + ' did not materially compress rasterized input');
    sizeResults.push({level, before: pdfBytes.length, after: resultBytes.length});
    console.log(level + ': ' + pdfBytes.length + ' -> ' + resultBytes.length);
  }
  assert.equal(errors.length, 0, 'Browser exceptions: ' + errors.join(' | '));
  console.log('PASS: three compression levels returned smaller readable PDFs with identical page geometry');
  console.log(JSON.stringify(sizeResults));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
