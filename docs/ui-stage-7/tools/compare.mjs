/**
 * תמונות השוואה "לפני | אחרי" לדוח — כל תמונה היא שורה או כמה שורות של זוגות.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-7/tools/compare.mjs <out.png> <width> <title> <caption>=<path> ...
 *
 * כל ארגומנט אחרי הכותרת הוא "כיתוב=נתיב". `--` מתחיל שורה חדשה. הרוחב הוא
 * רוחב כל תמונה בפיקסלים של CSS (390 למסך מלא, 480 לחלון הצף).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const [, , out, width, title, ...items] = process.argv;
const rows = [[]];
for (const it of items) {
  if (it === '--') rows.push([]);
  else {
    const i = it.indexOf('=');
    rows[rows.length - 1].push({ caption: it.slice(0, i), file: it.slice(i + 1) });
  }
}
const cols = Math.max(...rows.map((r) => r.length));
const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#0f0f0e;color:#f3efe6;font:500 15px system-ui,sans-serif;padding:16px;width:max-content">
<div style="font-size:18px;margin-bottom:12px">${title}</div>
${rows
  .map(
    (r) => `<div style="display:flex;gap:16px;margin-bottom:16px;align-items:flex-start">${r
      .map((c) => `<figure style="margin:0"><figcaption style="color:#c2bdb1;margin-bottom:6px">${c.caption}</figcaption><img src="${img(c.file)}" style="width:${width}px;display:block;border-radius:10px"></figure>`)
      .join('')}</div>`,
  )
  .join('')}
</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: (Number(width) + 16) * cols + 32, height: 600 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
