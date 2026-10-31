/**
 * צילומי "לפני/אחרי" של מסך היום (390×844 @2x) + בדיקות DOM לכל תרחיש.
 *
 *   node docs/ui-stage-2/tools/shoot.mjs <dist-dir> <out-dir> [before|after]
 *
 * "לפני" = build של ענף הבסיס (מסך "משקל"), "אחרי" = build של הענף הזה.
 * אותה זריעה, אותו שעון, אותו סקריפט.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checks, launch, openSeeded, phone, serve, settle } from './lib.mjs';

const [, , dist, outDir, label = 'after'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const WEEK = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];

/** תרחישים. `act` רץ אחרי הטעינה (שקילה, סגירת יום). */
const SCENARIOS = [
  // בוקר רביעי בלי שקילה: 3/7, מותניים "חסר — למדוד היום", יום פתוח.
  { id: '01-morning-no-weigh', today: WEEK[3] },
  // אותו בוקר אחרי שמירת השקילה (ערך ברירת המחדל = האחרונה).
  { id: '02-after-weigh', today: WEEK[3], act: 'weigh' },
  // שישי, שקילת רביעי חסרה, בלי שקילה היום: שבוע חלקי עם חור; מותניים "הוחמץ".
  { id: '03-partial-week-fri', today: WEEK[5], skipDays: [WEEK[3]] },
  // שבת עם 7/7: הגיבור מלא, שורת "הבוקר" קומפקטית.
  { id: '04-full-week-sat', today: WEEK[6], weighToday: true, time: '09:10:00' },
  // מותניים לפי היום בשבוע.
  { id: '05-waist-sun-upcoming', today: WEEK[0] },
  { id: '06-waist-wed-due', today: WEEK[3], crop: 'tiles' },
  { id: '07-waist-fri-missed', today: WEEK[5], crop: 'tiles' },
  { id: '08-waist-thu-measured', today: WEEK[4], extraWaist: [`${WEEK[4]}:96.5`], crop: 'tiles' },
  { id: '09-waist-mon-other', today: WEEK[2], extraWaist: [`${WEEK[1]}:96.5`], crop: 'tiles' },
  // יום פתוח / סגור.
  { id: '10-day-open', today: WEEK[3], weighToday: true, crop: 'day' },
  { id: '11-day-closed', today: WEEK[3], weighToday: true, act: 'close', crop: 'day' },
  // פרופיל בת הזוג: הטאב הראשון שלה (אימונים). לא אמור להשתנות.
  { id: '12-partner', today: WEEK[3], profile: 'partner' },
];

const browser = await launch();
const server = await serve(dist, 4300 + (label === 'before' ? 0 : 1));
const results = [];
try {
  for (const s of SCENARIOS) {
    const ctx = await phone(browser);
    const page = await openSeeded(ctx, server.url, s);
    if (s.act === 'weigh') {
      const btn = page.getByRole('button', { name: /שמור שקילה|עדכן שקילה/ });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await settle(page, 400);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (s.act === 'close') {
      const btn = page.getByRole('button', { name: /^סגור יום$|סיימתי לרשום/ }).first();
      if ((await btn.count()) === 0) {
        // בגרסה הישנה הסגירה קיימת רק במסך התזונה.
        await page.getByRole('tab', { name: 'תזונה' }).click();
        await settle(page);
      }
      const b2 = page.getByRole('button', { name: /^סגור יום$|סיימתי לרשום/ }).first();
      await b2.scrollIntoViewIfNeeded();
      await b2.click();
      await settle(page, 400);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await settle(page, 300);
    const m = await checks(page);
    const file = path.join(outDir, `${s.id}.png`);
    await page.screenshot({ path: file, fullPage: false });
    if (!s.profile) await page.screenshot({ path: path.join(outDir, `${s.id}--full.png`), fullPage: true });
    // חיתוך לאזור הרלוונטי (אריחים / מצב היום) כשהוא קיים — בגרסה החדשה בלבד.
    if (s.crop) {
      const sel = s.crop === 'tiles' ? '.tiles' : '[aria-label="מצב היום"]';
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await settle(page, 200);
        await el.screenshot({ path: path.join(outDir, `${s.id}--crop.png`) });
      }
    }
    results.push({ screen: s.id, ...m, smallTargetsList: m.smallTargetsList, contrastFails: m.contrastFails });
    console.log(`${label} ${s.id}: h=${m.scrollHeight} hscroll=${m.hscroll} small=${m.smallTargets} contrastMin=${m.contrastMin} flipped=${m.flippedNums}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(outDir, '..', '..', `checks-${label}.json`), JSON.stringify(results, null, 1));
