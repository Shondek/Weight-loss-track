/**
 * אופליין + עדכון גרסה, עם service worker אמיתי (שלב 7).
 *
 *   PW_PATH=<playwright> node docs/ui-stage-7/tools/offline.mjs <dist-before> <dist-after> <out-json>
 *
 * לכל build:
 *   A. אופליין: טעינה ראשונה עם רשת → ניתוק → רענון. האפליקציה נטענת, חיפוש
 *      המזון ("קוטג") מחזיר תוצאות, ושם ה-cache במבנה הרגיל (fatloss-<hash>).
 *   B. עדכון בחזרה מהרקע (ממצא 3): האפליקציה פתוחה על גרסה 1; בשרת מתפרסמת
 *      גרסה 2 (אותו build, sw.js שונה בבייט); עוברות 5 דקות; הדף "חוזר מהרקע"
 *      (visibilitychange) — **בלי ניווט ובלי טעינה מחדש**. האם מופיעה
 *      "גרסה חדשה של האפליקציה מוכנה"?
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { launch, openSeeded, settle } from './lib.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-11-11', time: '08:05:00' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: 'dark', serviceWorkers: 'allow' };

/** שרת סטטי שאפשר להחליף לו את התיקייה תוך כדי ריצה — "פריסה" של גרסה חדשה באותו origin. */
function serveSwitchable(initial, port) {
  const state = { dir: initial, hits: {} };
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    state.hits[url] = (state.hits[url] ?? 0) + 1;
    if (url === '/__blank') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>blank</title>');
      return;
    }
    let file = path.join(state.dir, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(state.dir, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', vary: 'Origin' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${port}`, use: (dir) => (state.dir = dir), count: (url) => state.hits[url] ?? 0, close: () => srv.close() })));
}

/** גרסה 2: אותו build בדיוק, עם sw.js ששם ה-cache שלו שונה — כמו build חדש. */
function nextVersionOf(dist) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fatloss-v2-'));
  fs.cpSync(dist, dir, { recursive: true });
  const sw = path.join(dir, 'sw.js');
  const src = fs.readFileSync(sw, 'utf8');
  const m = src.match(/const CACHE = 'fatloss-([0-9a-f]+)'/);
  fs.writeFileSync(sw, src.replace(/const CACHE = 'fatloss-[0-9a-f]+'/, `const CACHE = 'fatloss-${'f'.repeat(12)}'`));
  return { dir, cacheV1: m ? `fatloss-${m[1]}` : null };
}

async function waitSw(page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then((r) => new Promise((res) => {
    const w = r.active;
    if (!w || w.state === 'activated') return res();
    w.addEventListener('statechange', () => w.state === 'activated' && res());
  })));
  await settle(page, 1200);
}
const cacheNames = (page) => page.evaluate(() => caches.keys());
const banner = (page) => page.getByText('גרסה חדשה של האפליקציה מוכנה').count();

async function run(dist, port, label) {
  const v2 = nextVersionOf(dist);
  const server = await serveSwitchable(dist, port);
  const browser = await launch();
  const out = { label, cacheNameV1: v2.cacheV1 };
  try {
    // ---- A. אופליין ----
    {
      const ctx = await browser.newContext(ctxOpts);
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message)));
      await waitSw(page);
      const names = await cacheNames(page);
      const foodsCached = await page.evaluate(async () => {
        for (const n of await caches.keys()) if (await (await caches.open(n)).match('./nutrition/moh-foods.json', { ignoreVary: true })) return true;
        return false;
      });
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('nav.tabs', { timeout: 15000 });
      await page.waitForFunction(() => !document.body.innerText.includes('טוען…'));
      const today = (await page.locator('main').innerText()).includes('ממוצע שבועי');
      await page.getByRole('tab', { name: 'תזונה' }).click();
      await settle(page, 1200);
      await page.locator('#food-search').fill('קוטג');
      await settle(page, 600);
      const results = await page.locator('.nut-results .listrow, .results__btn').count();
      await page.getByRole('tab', { name: 'אימונים' }).click();
      await settle(page, 400);
      const workout = (await page.getByRole('button', { name: /^התחל אימון/ }).count()) > 0;
      out.offline = { cacheNames: names, cacheNameFormatOk: names.length === 1 && /^fatloss-[0-9a-f]{12}$/.test(names[0]), foodsCached, appLoadsOffline: today, searchResultsOffline: results, workoutScreenOffline: workout, jsErrors: errors };
      await ctx.close();
    }
    // ---- B. עדכון בחזרה מהרקע ----
    {
      const ctx = await browser.newContext(ctxOpts);
      const page = await openSeeded(ctx, server.url, SCENARIO);
      await waitSw(page);
      // טעינה שנייה: עכשיו יש controller, כלומר כל החלפה שלו היא עדכון.
      await page.reload();
      await page.waitForSelector('nav.tabs', { timeout: 15000 });
      await waitSw(page);
      const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
      // הדפדפן בודק את sw.js זמן קצר אחרי כל ניווט. מחכים שהבדיקה של הטעינה
      // תסתיים (מול גרסה 1), כדי שמה שנמדד אחר כך יהיה רק החזרה מהרקע.
      await settle(page, 8000);
      const bannerAtStart = await banner(page);
      const swRequestsBefore = server.count('/sw.js');
      server.use(v2.dir); // גרסה 2 "נפרסה"
      await page.clock.fastForward(5 * 60_000); // חמש דקות ברקע
      // חזרה למסך: אותם אירועים שהדפדפן שולח — בלי ניווט ובלי reload.
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      let shown = 0;
      for (let i = 0; i < 20 && !shown; i++) {
        await settle(page, 500);
        shown = await banner(page);
      }
      const names = await cacheNames(page);
      out.update = { controlled, bannerAtStart, swChecksAfterReturn: server.count('/sw.js') - swRequestsBefore, bannerAfterReturnFromBackground: shown > 0, cacheNamesAfter: names, refreshButton: (await page.getByRole('button', { name: 'רענן', exact: true }).count()) > 0 };
      if (shown) {
        await page.getByRole('button', { name: 'רענן', exact: true }).click();
        await page.waitForSelector('nav.tabs', { timeout: 15000 });
        await settle(page, 800);
        out.update.afterRefresh = { appLoads: (await page.locator('nav.tabs').count()) === 1, bannerGone: (await banner(page)) === 0, dataStillThere: (await page.locator('main').innerText()).includes('94.') };
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(v2.dir, { recursive: true, force: true });
  }
  return out;
}

const result = { before: await run(distBefore, 4740, 'before'), after: await run(distAfter, 4741, 'after') };
fs.writeFileSync(outJson, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
