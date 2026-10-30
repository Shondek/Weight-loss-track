/* תמונת השוואה לכל מסך: שלושת הכיוונים זה לצד זה (ימין → שמאל: 1, 2, 3), @2x. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
import fs from 'node:fs';
import path from 'node:path';

const shotsDir = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
fs.mkdirSync(outDir, { recursive: true });
const dirs = [
  ['01-soft-minimalism', '1 · נייר — מינימליזם רך', 'Heebo · Lucide 1.75'],
  ['02-ledger', '2 · פנקס — עריכה טיפוגרפית', 'IBM Plex Sans Hebrew · Lucide 1.5'],
  ['03-night', '3 · לילה — כהה, אימון-תחילה', 'Rubik · Lucide 2'],
];
const screens = [
  ['1-today', 'היום'],
  ['2-workout', 'אימון פעיל'],
  ['3-nutrition', 'תזונה'],
  ['4-trend', 'מגמה'],
  ['5-nutrition-sheet', 'תזונה — חלונית כמות'],
];
const heebo = fs.readFileSync(new URL('../../../src/fonts/', import.meta.url).pathname + 'heebo-hebrew.woff2').toString('base64');
const heeboL = fs.readFileSync(new URL('../../../src/fonts/', import.meta.url).pathname + 'heebo-latin.woff2').toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1290, height: 980 }, deviceScaleFactor: 2 });
for (const [key, title] of screens) {
  const imgs = dirs.map(([id, name, meta]) => {
    const b = fs.readFileSync(path.join(shotsDir, `${id}--${key}.png`)).toString('base64');
    return `<figure><figcaption><b>${name}</b><span>${meta}</span></figcaption><img src="data:image/png;base64,${b}" alt=""></figure>`;
  });
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
  @font-face{font-family:Heebo;src:url(data:font/woff2;base64,${heebo}) format('woff2');unicode-range:U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F;}
  @font-face{font-family:Heebo;src:url(data:font/woff2;base64,${heeboL}) format('woff2');unicode-range:U+0000-00FF;}
  body{margin:0;background:#E9E6DF;font-family:Heebo,system-ui,sans-serif;color:#1E1C17;padding:28px 30px 30px;}
  h1{margin:0 0 18px;font-size:22px;font-weight:600;}
  h1 span{font-weight:400;color:#6E6A61;font-size:15px;margin-inline-start:12px;}
  .row{display:grid;grid-template-columns:repeat(3,390px);gap:30px;}
  figure{margin:0;display:grid;gap:10px;}
  figcaption{display:flex;justify-content:space-between;align-items:baseline;font-size:15px;}
  figcaption span{font-size:12px;color:#6E6A61;}
  img{width:390px;height:844px;display:block;border-radius:18px;box-shadow:0 12px 30px -16px rgba(0,0,0,.35);}
  </style></head><body><h1>${title}<span>390×844 · שלושה כיוונים · נתוני דמה</span></h1><div class="row">${imgs.join('')}</div></body></html>`;
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, `compare-${key}.png`), fullPage: true });
  console.log('compare-' + key + '.png');
}
await browser.close();
