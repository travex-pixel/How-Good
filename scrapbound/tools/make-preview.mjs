// Renders scrapbound/preview.png (share card) and scrapbound/icon.png from tools/preview.html.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pw;
try { pw = await import('playwright'); } catch { pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs').href); }
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
await p.goto(pathToFileURL(path.join(root, 'tools/preview.html')).href);
await p.waitForFunction(() => window.done);
await p.locator('#og').screenshot({ path: path.join(root, 'preview.png') });
const icon = await p.evaluate(() => { const s = document.createElement('canvas'); s.width = s.height = 180; s.getContext('2d').drawImage(document.getElementById('icon'), 0, 0, 180, 180); return s.toDataURL('image/png'); });
const fs = await import('node:fs');
fs.writeFileSync(path.join(root, 'icon.png'), Buffer.from(icon.split(',')[1], 'base64'));
await b.close();
console.log('wrote preview.png and icon.png');
