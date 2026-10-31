/**
 * בדיקת האופליין של חיפוש המזון, עם service worker אמיתי, על שני builds.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-4/tools/offline.mjs <dist-before> <dist-after> <out-json>
 *
 * לכל build:
 *   A. טעינה ראשונה עם רשת → ניתוק → רענון → חיפוש. (המסלול הרגיל.)
 *   B. הורדת קובץ המזון נקטעת בזמן ההתקנה (route.abort) → רענון עם רשת,
 *      בלי לפתוח את טאב התזונה → ניתוק → רענון → חיפוש. זה המקרה שנשבר
 *      בשקט לפני שלב 4: ההתקנה "הצליחה" בלי הקובץ, ושום דבר לא ניסה שוב.
 *   C. מכשיר בלי מטמון של המאגר ובלי רשת: ההודעה בחיפוש.
 * השרת מחזיר `Vary` ו-`cache-control` כמו GitHub Pages.
 */
import fs from 'node:fs';
import { launch, openSeeded, serve, settle } from './lib.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };

const ctxOpts = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'he-IL',
  timezoneId: 'Asia/Jerusalem',
  colorScheme: 'dark',
  serviceWorkers: 'allow',
};

async function cacheState(page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const out = {};
    for (const n of names) {
      const c = await caches.open(n);
      out[n] = (await c.keys()).map((k) => new URL(k.url).pathname);
    }
    return out;
  });
}
const hasFoods = (state) => Object.values(state).some((urls) => urls.some((u) => u.endsWith('/nutrition/moh-foods.json')));

async function waitSw(page) {
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(
      (r) =>
        new Promise((res) => {
          const w = r.active;
          if (!w || w.state === 'activated') return res();
          w.addEventListener('statechange', () => w.state === 'activated' && res());
        }),
    ),
  );
  await settle(page, 1000);
}

/** פותח את טאב התזונה, מחפש "קוטג", ומחזיר מה המסך אומר. */
async function searchState(page) {
  await page.getByRole('tab', { name: 'תזונה' }).click();
  await settle(page, 1200);
  const search = page.locator('#food-search');
  await search.fill('קוטג');
  await settle(page, 500);
  const text = await page.locator('main').innerText();
  const results = await page.locator('.nut-results .listrow, .results__btn').count();
  return {
    results,
    placeholder: await search.getAttribute('placeholder'),
    offlineMessage: text.includes('מאגר המזון עוד לא נשמר במכשיר'),
    genericError: text.includes('מאגר המזון לא נטען'),
    retryButton: (await page.getByRole('button', { name: 'נסה שוב' }).count()) > 0,
  };
}

async function run(dist, port, label) {
  const server = await serve(dist, port);
  const browser = await launch();
  const out = { label };
  try {
    // A
    {
      const ctx = await browser.newContext(ctxOpts);
      const page = await openSeeded(ctx, server.url, SCENARIO);
      await waitSw(page);
      const installed = await cacheState(page);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('nav.tabs', { timeout: 15000 });
      out.A = { foodsCachedAfterFirstLoad: hasFoods(installed), offlineSearch: await searchState(page) };
      await ctx.close();
    }
    // B
    {
      const ctx = await browser.newContext(ctxOpts);
      await ctx.route('**/nutrition/moh-foods.json', (r) => r.abort('failed'));
      const page = await openSeeded(ctx, server.url, SCENARIO);
      await waitSw(page);
      const afterInstall = await cacheState(page);
      await ctx.unroute('**/nutrition/moh-foods.json');
      await page.reload();
      await page.waitForSelector('nav.tabs', { timeout: 15000 });
      await settle(page, 3000);
      const afterReload = await cacheState(page);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('nav.tabs', { timeout: 15000 });
      out.B = { foodsCachedAfterCutInstall: hasFoods(afterInstall), foodsCachedAfterNextOnlineOpen: hasFoods(afterReload), offlineSearch: await searchState(page) };
      await ctx.close();
    }
    // C
    {
      const ctx = await browser.newContext(ctxOpts);
      await ctx.route('**/nutrition/moh-foods.json', (r) => r.abort('failed'));
      const page = await openSeeded(ctx, server.url, SCENARIO);
      await waitSw(page);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('nav.tabs', { timeout: 15000 });
      out.C = { foodsCached: hasFoods(await cacheState(page)), offlineSearch: await searchState(page) };
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

const result = { before: await run(distBefore, 4420, 'before'), after: await run(distAfter, 4421, 'after') };
fs.writeFileSync(outJson, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
