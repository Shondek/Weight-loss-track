/* צילומי מסך 390×844 @2x לכל מסך בכל כיוון, ובדיקות RTL / גלילה אופקית / פונט. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
const shotsDir = process.argv[3];
fs.mkdirSync(shotsDir, { recursive: true });
const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.html')).sort();
const screens = [
  ['today', '1-today'],
  ['workout-timer', '2-workout'],
  ['nutrition', '3-nutrition'],
  ['trend', '4-trend'],
  ['nutrition-sheet', '5-nutrition-sheet'],
  ['system', '6-system'],
];
const full = process.argv.includes('--full');
const browser = await chromium.launch();
const results = [];
for (const f of files) {
  const id = f.replace('.html', '');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await ctx.newPage();
  const url = 'file://' + path.resolve(outDir, f);
  for (const [hash, name] of screens) {
    await page.goto('about:blank');
    await page.goto(`${url}#${hash}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => ({
      dir: getComputedStyle(document.documentElement).direction,
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollH: document.documentElement.scrollHeight,
      font: getComputedStyle(document.body).fontFamily,
      fontLoaded: document.fonts.check(`16px ${getComputedStyle(document.body).fontFamily.split(',')[0]}`),
      small: [...document.querySelectorAll('button, a, input, [role=button]')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.height < 40 || r.width < 40)).length,
    }));
    results.push({ id, screen: name, ...m });
    await page.screenshot({ path: path.join(shotsDir, `${id}--${name}.png`), fullPage: false });
    if (full && hash !== 'nutrition-sheet') await page.screenshot({ path: path.join(shotsDir, `${id}--${name}--full.png`), fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.table(results.map((r) => ({ file: r.id, screen: r.screen, dir: r.dir, hscroll: r.hscroll, height: r.scrollH, font: r.fontLoaded, smallTargets: r.small })));
fs.writeFileSync(path.join(shotsDir, 'checks.json'), JSON.stringify(results, null, 1));
