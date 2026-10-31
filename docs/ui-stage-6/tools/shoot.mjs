/**
 * צילומים (390×844 @2x) + בדיקות DOM לשלב 6, לגרסה אחת (לפני או אחרי):
 * צ'ק-אין מלא, הסיכום, שיתוף, נתונים מלא, אזור מסוכן, תזונה בלי הכפתור
 * הכפול, פרופיל בת הזוג.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-6/tools/shoot.mjs <dist-dir> <out-dir> <checks-json> <before|after>
 *
 * אותה זריעה (שישי 30/10/2026 08:05) ואותו שעון כמו בכלי השוויון. לכל צילום
 * נרשמות בדיקות ה-DOM (RTL, גלילה אופקית, אזורי מגע < 44, ניגודיות, מספרים).
 */
import fs from 'node:fs';
import path from 'node:path';
import { checks, launch, openSeeded, phone, serve, settle, tab } from './lib.mjs';
import { CHECKIN, driverFor } from './drive.mjs';

const [, , dist, outDir, checksJson, version = 'after'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };

const STUBS = () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (t) => {
        window.__copied = t;
        return Promise.resolve();
      },
    },
  });
  navigator.share = (d) => {
    window.__shared = d;
    return Promise.resolve();
  };
};

async function scrollTo(page, locator) {
  await locator.first().scrollIntoViewIfNeeded();
  await page.evaluate((el) => el.scrollIntoView({ block: 'start' }), await locator.first().elementHandle());
  await settle(page, 250);
}

const SCENARIOS = [
  {
    id: '01-checkin-full',
    title: "צ'ק-אין מלא (כל השדות מלאים) — הדף המלא",
    full: true,
    act: async (d) => {
      await d.fillCheckin(CHECKIN);
      await d.page.evaluate(() => window.scrollTo(0, 0));
      await d.page.locator('.toast:not(.toast--static)').waitFor({ state: 'detached', timeout: 4000 }).catch(() => undefined);
    },
  },
  {
    id: '02-checkin-summary',
    title: "צ'ק-אין: סיכום השבוע במסך",
    act: async (d, page) => {
      await tab(page, "צ'ק-אין");
      await scrollTo(page, page.getByRole('heading', { name: 'סיכום השבוע', exact: true }));
    },
  },
  {
    id: '03-checkin-share',
    title: "צ'ק-אין: סיכום שבועי לצ'אט — העתק · שתף · קובץ טקסט",
    act: async (d, page) => {
      await tab(page, "צ'ק-אין");
      await scrollTo(page, page.getByRole('heading', { name: "סיכום שבועי לצ'אט" }));
    },
    extra: async (d) => ({ shared: (await d.shareWeeklySummary())?.text?.length ?? null, copied: (await d.copyWeeklySummary())?.length ?? null }),
  },
  { id: '04-data-full', title: 'נתונים — הדף המלא', full: true, act: async (d, page) => tab(page, 'נתונים') },
  {
    id: '05-data-danger',
    title: 'נתונים: אזור מסוכן — "מחק הכול" בשלב המילה המוקלדת (לא הוקלד דבר)',
    act: async (d, page) => {
      await d.openWipeStep2();
      await scrollTo(page, page.getByRole('heading', { name: /אזור מסוכן/ }));
    },
  },
  {
    id: '06-nutrition-bottom',
    title: 'תזונה: התחתית — ארוחת שישי והכיתוב, בלי כפתור סגירה שני',
    act: async (d, page) => {
      await tab(page, 'תזונה');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await settle(page, 250);
    },
    extra: async (d) => ({ closeButtons: await d.closeButtons() }),
  },
  {
    id: '07-nutrition-top',
    title: 'תזונה: הכותרת עם "סגור יום" — הכפתור היחיד',
    act: async (d, page) => {
      await tab(page, 'תזונה');
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 200);
    },
  },
  { id: '08-partner-data', title: 'בת הזוג: נתונים — הדף המלא', profile: 'partner', full: true, act: async (d, page) => tab(page, 'נתונים') },
  {
    id: '09-data-foods',
    title: 'נתונים: המזונות שלי — הרשימה פתוחה',
    act: async (d, page) => {
      await tab(page, 'נתונים');
      const disc = page.getByRole('button', { name: version === 'before' ? /^מזונות שלי/ : /^הרשימה/ });
      await disc.scrollIntoViewIfNeeded();
      await disc.click();
      await settle(page, 200);
      await scrollTo(page, page.getByRole('heading', { name: version === 'before' ? 'ספריית המנות' : 'המזונות שלי' }));
    },
  },
  {
    id: '10-data-status',
    title: 'נתונים: כרטיס "מצב" (אחרי: שורות עם מספרים מבודדים, רשומות פתוח)',
    act: async (d, page) => {
      await tab(page, 'נתונים');
      const disc = page.getByRole('button', { name: /^רשומות/ });
      if ((await disc.count()) > 0) await disc.first().click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 200);
    },
  },
  {
    id: '11-partner-workout',
    title: 'בת הזוג: אימונים (ליטוש "ערוך")',
    profile: 'partner',
    act: async (d, page) => tab(page, 'אימונים'),
  },
];

const server = await serve(dist, version === 'before' ? 4620 : 4621);
const browser = await launch();
const results = [];
try {
  const ctx = await phone(browser);
  await ctx.addInitScript(STUBS);
  for (const sc of SCENARIOS) {
    const page = await openSeeded(ctx, server.url, { ...SCENARIO, ...(sc.profile ? { profile: sc.profile } : {}) });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    const d = driverFor(page, version);
    await sc.act(d, page);
    await settle(page, 300);
    await page.screenshot({ path: path.join(outDir, `${sc.id}.png`), fullPage: sc.full === true });
    const c = await checks(page);
    const extra = sc.extra ? await sc.extra(d, page) : {};
    results.push({ id: sc.id, title: sc.title, errors, ...extra, ...c });
    console.log(sc.id, JSON.stringify({ hscroll: c.hscroll, small: c.smallTargets, smallList: c.smallTargetsList.slice(0, 3), contrastMin: c.contrastMin, fails: c.contrastFails.slice(0, 3), flipped: c.flippedNums, h: c.scrollHeight, errors, ...extra }));
    await page.close();
  }
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(checksJson, JSON.stringify(results, null, 1));
