/**
 * עזרים משותפים לכלי שלב 3 (מסך האימון): שרת סטטי ל-dist, הקשר Playwright
 * של 390×844, זריעה ושעון. כלי עבודה בלבד — לא חלק מה-build.
 * מבוסס על docs/ui-stage-2/tools/lib.mjs; התוספת: שעון מותקן (לא קבוע)
 * כדי שטיימר המנוחה וריצת האירובי יתקדמו, ומעבר לטאב האימונים.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { buildSeed, seedInBrowser, wipeInBrowser } from './seed.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/** שרת סטטי ל-dist. `/__blank` מחזיר דף ריק באותו origin — לזריעה לפני טעינת האפליקציה. */
export function serve(dir, port) {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/__blank') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>blank</title>');
      return;
    }
    let file = path.join(dir, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${port}`, close: () => srv.close() })));
}

export async function launch() {
  return chromium.launch();
}

/** הקשר של טלפון: 390×844 @2x, עברית, ירושלים, כהה, בלי service worker. */
export async function phone(browser) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'dark',
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
}

/**
 * פותח דף על האפליקציה אחרי זריעה: ניקוי → זריעה בדף ריק באותו origin →
 * שעון קבוע → טעינת האפליקציה → המתנה לסיום הטעינה.
 */
export async function openSeeded(ctx, baseUrl, scenario, { hash = '', wipe = true, seed = true } = {}) {
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/__blank`);
  if (wipe) await page.evaluate(wipeInBrowser);
  if (seed) await page.evaluate(seedInBrowser, buildSeed(scenario));
  // שעון מותקן: Date.now() מתחיל בזמן התרחיש ומתקדם רק דרך clock.runFor —
  // דטרמיניסטי בשתי הגרסאות, וטיימרים (מנוחה, ריצת אירובי) באמת רצים.
  await page.clock.install({ time: new Date(`${scenario.today}T${scenario.time ?? '08:05:00'}+02:00`) });
  await page.goto(`${baseUrl}/${hash}`);
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForFunction(() => !document.body.innerText.includes('טוען…'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return page;
}

export async function settle(page, ms = 250) {
  await page.waitForTimeout(ms);
}

/** מעבר לטאב לפי שם. */
export async function tab(page, name) {
  await page.getByRole('tab', { name }).click();
  await settle(page, 300);
}

/** מקדם את השעון המותקן (טיימרים, ריצת אירובי). */
export async function advance(page, ms) {
  await page.clock.runFor(ms);
  await settle(page, 100);
}

/** בדיקות DOM: RTL, גלילה אופקית, אזורי מגע < 44, ניגודיות טקסט, מספרים שלא מתהפכים. */
export async function checks(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim());
      return { r: +r, g: +g, b: +b, a: +a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const ratio = (a, b) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const bgOf = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a >= 1) break;
        }
      }
      let out = { r: 22, g: 22, b: 20, a: 1 };
      for (const l of layers.reverse()) out = blend(l, out);
      return out;
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.visually-hidden');
    };
    const pairs = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const text = n.textContent.trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el || !visible(el) || el.classList.contains('visually-hidden')) continue;
      const cs = getComputedStyle(el);
      let fg = parse(cs.color);
      if (!fg) continue;
      let op = 1;
      for (let p = el; p; p = p.parentElement) op *= +getComputedStyle(p).opacity;
      const bg = bgOf(el);
      fg = blend({ ...fg, a: fg.a * op }, bg);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
      pairs.push({ sample: text.slice(0, 24), cls: el.className?.toString().slice(0, 40), ratio: Math.round(ratio(fg, bg) * 100) / 100, large, size });
    }
    const targets = [...document.querySelectorAll('button, a, input, select, textarea, [role=button]')]
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44 || r.width < 44)
      .map(({ el, r }) => ({ tag: el.tagName, cls: el.className?.toString().slice(0, 40), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }));
    // מספרים: כל .num צריך להיות LTR ומבודד.
    const flipped = [...document.querySelectorAll('.num')].filter(visible).filter((el) => getComputedStyle(el).direction !== 'ltr').length;
    const fails = pairs.filter((p) => p.ratio < (p.large ? 3 : 4.5));
    return {
      dir: getComputedStyle(document.documentElement).direction,
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, ''),
      smallTargets: targets.length,
      smallTargetsList: targets,
      contrastMin: pairs.length ? Math.min(...pairs.map((p) => p.ratio)) : null,
      contrastFails: fails,
      textNodes: pairs.length,
      flippedNums: flipped,
    };
  });
}
