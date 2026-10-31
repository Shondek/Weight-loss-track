/**
 * צילומי "לפני/אחרי" של מסך התזונה (390×844 @2x) + בדיקות DOM לכל תרחיש.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-4/tools/shoot.mjs <dist-dir> <out-dir> [before|after]
 *
 * "לפני" = build של ענף הבסיס (2943fd7), "אחרי" = build של הענף הזה. אותה
 * זריעה (שישי 30/10/2026 08:05), אותו שעון, אותן פעולות דרך הנהג של כל
 * גרסה (drive.mjs). `--crop` = צילום של האלמנט בלבד.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checks, launch, openSeeded, phone, serve, settle } from './lib.mjs';
import { driverFor } from './drive.mjs';
import { CUSTOM } from './session.mjs';

const [, , dist, outDir, label = 'after'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const TODAY = '2026-10-30';

const sheet = (page) => page.locator('.sheet');
const crop = async (loc, file) => {
  await loc.scrollIntoViewIfNeeded();
  await settle(loc.page(), 150);
  await loc.screenshot({ path: path.join(outDir, `${file}--crop.png`) });
};

/** תרחישים: `act(d, page)` מביא את המסך למצב המצולם. */
const SCENARIOS = [
  { id: '01-full', title: 'מסך מלא', act: async (d) => d.openTab() },
  {
    id: '02-sheet-grams',
    title: 'חלונית כמות בגרמים (סלט, בלי יחידה)',
    act: async (d, page) => {
      await d.openTab();
      if (label === 'before') {
        await crop(page.locator('.nut-quick__item', { hasText: 'סלט ירקות' }), '02-sheet-grams');
      } else {
        await page.getByRole('region', { name: 'מה שאני אוכל' }).locator('.listrow', { hasText: 'סלט ירקות' }).click();
        await settle(page, 300);
        await crop(sheet(page), '02-sheet-grams');
      }
    },
  },
  {
    id: '03-sheet-unit',
    title: 'חלונית כמות ביחידות (קוטג׳ בגביע, ממועדף)',
    act: async (d, page) => {
      await d.openTab();
      if (label === 'before') {
        await crop(page.locator('.nut-quick__item', { hasText: "קוטג'" }), '03-sheet-unit');
      } else {
        await page.locator('.qtile', { hasText: "קוטג'" }).first().click();
        await settle(page, 300);
        await crop(sheet(page), '03-sheet-unit');
      }
    },
  },
  {
    id: '04-search',
    title: 'חיפוש',
    act: async (d, page) => {
      await d.openTab();
      await page.locator('#food-search').fill('קוטג');
      await settle(page, 400);
      await page.locator('#food-search').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -80));
    },
  },
  {
    id: '05-search-offline-nocache',
    title: 'חיפוש בלי רשת ובלי מטמון של המאגר',
    offlineBeforeTab: true,
    act: async (d, page) => {
      await d.openTab();
      await settle(page, 800);
      await page.locator('#food-search').fill('קוטג');
      await settle(page, 400);
      await page.locator('#food-search').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -80));
      await crop(page.locator(label === 'before' ? '.nut-card:has(#food-search)' : '.nut-searchcard'), '05-search-offline-nocache');
    },
  },
  {
    id: '06-long-name',
    title: 'שם ארוך ב"מה שאני אוכל"',
    act: async (d, page) => {
      await d.openTab();
      const row = label === 'before' ? page.locator('.nut-quick__item', { hasText: 'סלט ירקות' }) : page.getByRole('region', { name: 'מה שאני אוכל' }).locator('.listrow', { hasText: 'סלט ירקות' });
      await crop(row, '06-long-name');
      await page.evaluate(() => window.scrollBy(0, -200));
    },
  },
  {
    id: '07-closed-toast',
    title: 'יום סגור עם Toast',
    act: async (d, page) => {
      await d.openTab();
      await d.closeDay();
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 200);
    },
  },
  {
    id: '08-custom-food-editor',
    title: 'עורך מזון שלי (מהתווית)',
    act: async (d, page) => {
      await d.openTab();
      if (label === 'before') {
        await page.getByRole('tab', { name: 'נתונים' }).click();
        await settle(page, 300);
        await page.getByRole('button', { name: /^מזונות שלי/ }).click();
        await page.getByRole('button', { name: 'מזון מהתווית' }).click();
      } else {
        await page.locator('#food-search').fill(CUSTOM.name);
        await settle(page, 300);
        await page.getByRole('button', { name: 'הוסף מזון מהתווית' }).click();
      }
      await settle(page, 300);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  },
  { id: '09-partner', title: 'פרופיל בת הזוג — המסך הראשון (אין טאב תזונה)', profile: 'partner', act: async () => undefined },
  {
    id: '10-partner-data',
    title: 'פרופיל בת הזוג — מסך נתונים (בלי ניהול תזונה)',
    profile: 'partner',
    act: async (d, page) => {
      await page.getByRole('tab', { name: 'נתונים' }).click();
      await settle(page, 300);
    },
  },
  {
    id: '11-sheet-edit',
    title: 'עריכת רישום (קוטג׳ 07:10)',
    act: async (d, page) => {
      await d.openTab();
      if (label === 'before') {
        const row = page.locator('.nut-row', { hasText: "קוטג'" }).first();
        await row.locator('.nut-row__tap').click();
        await settle(page, 300);
        await crop(row, '11-sheet-edit');
      } else {
        await page.getByRole('region', { name: /^מה אכלתי/ }).locator('.listrow', { hasText: "קוטג'" }).first().click();
        await settle(page, 300);
        await crop(sheet(page), '11-sheet-edit');
      }
    },
  },
  {
    id: '12-out',
    title: '"בחוץ" — הערכה לארוחה',
    act: async (d, page) => {
      await d.openTab();
      await page.getByRole('button', { name: label === 'before' ? /^ארוחה בחוץ/ : 'בחוץ' }).click();
      await settle(page, 300);
      await page.locator('#out-name').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -120));
    },
  },
];

const browser = await launch();
const server = await serve(dist, 4400 + (label === 'before' ? 0 : 1));
const results = [];
try {
  for (const s of SCENARIOS) {
    const ctx = await phone(browser);
    const page = await openSeeded(ctx, server.url, { today: TODAY, profile: s.profile ?? null });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // "בלי מטמון ובלי רשת": ה-service worker חסום בהקשר הזה, והרשת מנותקת לפני פתיחת הטאב.
    if (s.offlineBeforeTab) await ctx.setOffline(true);
    const d = driverFor(page, label);
    try {
      await s.act(d, page);
    } catch (e) {
      errors.push(`act: ${e.message.split('\n')[0]}`);
    }
    await settle(page, 300);
    const m = await checks(page);
    await page.screenshot({ path: path.join(outDir, `${s.id}.png`), fullPage: false });
    await page.screenshot({ path: path.join(outDir, `${s.id}--full.png`), fullPage: true });
    results.push({ screen: s.id, title: s.title, ...m, errors });
    console.log(`${label} ${s.id}: h=${m.scrollHeight} hscroll=${m.hscroll} small=${m.smallTargets} contrastMin=${m.contrastMin} flipped=${m.flippedNums}${errors.length ? ' ERR ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(outDir, '..', '..', `checks-${label}.json`), JSON.stringify(results, null, 1));
