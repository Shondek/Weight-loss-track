/**
 * צילומי "לפני/אחרי" של מסך האימון (390×844 @2x) + בדיקות DOM לכל תרחיש.
 *
 *   node docs/ui-stage-3/tools/shoot.mjs <dist-dir> <out-dir> [before|after]
 *
 * "לפני" = build של ענף הבסיס (41cafe0), "אחרי" = build של הענף הזה. אותה
 * זריעה (שישי 30/10/2026 08:05, הבא בתור A), אותו שעון, אותן פעולות דרך
 * הנהג של כל גרסה (drive.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { advance, checks, launch, openSeeded, phone, serve, settle } from './lib.mjs';
import { driverFor } from './drive.mjs';

const [, , dist, outDir, label = 'after'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const TODAY = '2026-10-30';

/** תרחישים: `act(d, page)` מביא את המסך למצב המצולם. */
const SCENARIOS = [
  { id: '01-start', title: 'מסך פתיחה', act: async (d) => d.openTab() },
  { id: '02-warmup', title: 'חימום', act: async (d) => { await d.openTab(); await d.start('A'); await d.goTo(0); } },
  { id: '03-suggestion', title: 'תרגיל עם הצעה (A1)', act: async (d) => { await d.openTab(); await d.start('A'); await d.goTo(1); } },
  { id: '04-calibration', title: 'סשן כיול (A3)', act: async (d) => { await d.openTab(); await d.start('A'); await d.goTo(3); } },
  { id: '05-bodyweight-a6', title: 'משקל גוף (A6)', act: async (d) => { await d.openTab(); await d.start('A'); await d.goTo(6); } },
  { id: '06-plank-a8', title: 'פלאנק (A8)', act: async (d) => { await d.openTab(); await d.start('A'); await d.goTo(8); } },
  {
    id: '07-after-last-set',
    title: 'אחרי הסט האחרון (RIR פתוח)',
    act: async (d, page) => {
      await d.openTab();
      await d.start('A');
      await d.goTo(1);
      await d.useSuggestion();
      for (const i of [1, 2, 3]) await d.logSet(i, 10);
      // הטיימר רץ אחרי הרישום; מדלגים כדי לראות את ה-RIR בלי הפס.
      const skip = page.locator('.resttimer').getByRole('button', { name: 'דלג' });
      if ((await skip.count()) > 0) await skip.click();
      await settle(page, 200);
    },
  },
  {
    id: '08-timer',
    title: 'טיימר מנוחה',
    act: async (d, page) => {
      await d.openTab();
      await d.start('A');
      await d.goTo(1);
      await d.useSuggestion();
      await d.logSet(1, 10);
      await advance(page, 12_000);
      await page.locator('.resttimer').screenshot({ path: path.join(outDir, '08-timer--crop.png') });
    },
  },
  { id: '09-swap', title: '"החלף"', act: async (d, page) => { await d.openTab(); await d.start('A'); await d.goTo(5); await page.getByRole('button', { name: 'החלף', exact: true }).click(); await settle(page, 300); } },
  { id: '10-skip', title: 'דילוג ("דלג ואחזור")', act: async (d) => { await d.openTab(); await d.start('A'); await d.goTo(4); await d.skip(); } },
  {
    id: '11-finish-pain-unrated',
    title: 'כאב לא מדורג במסך הסיום',
    act: async (d, page) => {
      await d.openTab();
      await d.start('A');
      await d.goTo(1);
      await d.useSuggestion();
      for (const i of [1, 2, 3]) await d.logSet(i, 10);
      await d.setRir(2);
      const skip = page.locator('.resttimer').getByRole('button', { name: 'דלג' });
      if ((await skip.count()) > 0) await skip.click();
      await d.goTo('finish');
      if (label === 'before') {
        // בגרסה הישנה אזור הסיום (כאב + "סיים") הוא בתחתית העורך.
        await page.locator('.btn--primary.btn--block', { hasText: /^סיים$/ }).scrollIntoViewIfNeeded();
      }
    },
  },
  { id: '12-workout-d', title: 'אימון D', act: async (d) => { await d.openTab(); await d.start('D'); await d.goTo(1); } },
  { id: '13-partner', title: 'פרופיל בת הזוג', profile: 'partner', act: async (d) => { await d.openTab(); await d.start('A'); await d.goTo(1); } },
  { id: '14-partner-start', title: 'פרופיל בת הזוג — מסך פתיחה', profile: 'partner', act: async (d) => d.openTab() },
  {
    id: '15-pain-rated',
    title: 'כאב אחרי דירוג מלא (ברך 2 · כתף 0) בתצוגת המוקד',
    act: async (d, page) => {
      await d.openTab();
      await d.start('A');
      await d.goTo(1);
      await d.pain(2, 0);
      const row = page.locator('.wk-pain').first();
      await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await settle(page, 200);
      await row.screenshot({ path: path.join(outDir, '15-pain-rated--crop.png') });
    },
  },
];

const browser = await launch();
const server = await serve(dist, 4300 + (label === 'before' ? 0 : 1));
const results = [];
try {
  for (const s of SCENARIOS) {
    const ctx = await phone(browser);
    const page = await openSeeded(ctx, server.url, { today: TODAY, profile: s.profile ?? null });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const d = driverFor(page, label);
    try {
      await s.act(d, page);
    } catch (e) {
      errors.push(`act: ${e.message.split('\n')[0]}`);
    }
    await settle(page, 300);
    // "לפני": העורך מתחת לרשימת השבוע — מגלגלים אליו כדי שהצילום ישווה תוכן ולא גלילה.
    if (label === 'before' && !['01-start', '14-partner-start'].includes(s.id) && !s.id.startsWith('11')) {
      const focus = page.locator('.focusnav').first();
      if ((await focus.count()) > 0) await focus.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await settle(page, 200);
    }
    // "אחרי": תצוגת המוקד מתחילה מראש המסך (הנהג גלל כדי ללחוץ).
    if (label === 'after' && !s.id.startsWith('09') && !s.id.startsWith('15')) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 200);
    }
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
