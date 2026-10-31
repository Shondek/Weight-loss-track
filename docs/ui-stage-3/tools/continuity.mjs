/**
 * המשכיות אחרי עדכון: מתחילים סשן בגרסה הישנה, רושמים שני תרגילים, מחליפים
 * את ה-build לגרסה החדשה באותו origin (אותו port), וממשיכים.
 *
 *   node docs/ui-stage-3/tools/continuity.mjs <dist-before> <dist-after> <out-json>
 *
 * הבדיקה: אחרי הרענון הסשן נפתח על אותו אימון, באותו תרגיל (השלישי), עם
 * שני התרגילים הראשונים מסומנים כנרשמו; ממשיכים לתרגיל השלישי ומסיימים;
 * הייצוא מכיל אימון אחד עם שלושת התרגילים, וטיוטת ה-uiState נשארה באותו
 * מפתח ומבנה (`fatloss:ui:editor` = {openId, focus, at}).
 */
import fs from 'node:fs';
import { launch, openSeeded, phone, serve, settle } from './lib.mjs';
import { driverFor } from './drive.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };
const PORT = 4320;

const browser = await launch();
const out = {};
let server = await serve(distBefore, PORT);
try {
  const ctx = await phone(browser);
  // ---- גרסה ישנה: סשן A, שני תרגילים ----
  const page = await openSeeded(ctx, server.url, SCENARIO);
  const d0 = driverFor(page, 'before');
  await d0.openTab();
  await d0.start('A');
  for (const n of [1, 2]) {
    await d0.goTo(n);
    await d0.useSuggestion();
    for (const i of [1, 2, 3]) await d0.logSet(i, n === 1 ? 10 : 8);
    await d0.setRir(2);
    await d0.next();
  }
  out.beforeWhere = await d0.where();
  out.editorBefore = await page.evaluate(() => localStorage.getItem('fatloss:ui:editor'));
  out.timerBefore = await page.evaluate(() => localStorage.getItem('fatloss:ui:timer'));

  // ---- החלפת ה-build באותו origin, רענון ----
  server.close();
  await new Promise((r) => setTimeout(r, 200));
  server = await serve(distAfter, PORT);
  await page.reload();
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForFunction(() => !document.body.innerText.includes('טוען…'));
  await settle(page, 400);
  const d1 = driverFor(page, 'after');
  // הטאב חוזר לברירת המחדל אחרי רענון (כמו קודם) — נכנסים לאימונים.
  await d1.openTab();
  out.afterWhere = await d1.where();
  out.editorAfterReload = await page.evaluate(() => localStorage.getItem('fatloss:ui:editor'));
  out.afterLoggedSets = await page.evaluate(() => document.querySelectorAll('.set__done').length);
  out.afterHeader = await page.locator('.wk-head').innerText();
  out.afterSegments = await page.evaluate(() => [...document.querySelectorAll('.seg')].map((s) => s.className.replace('seg ', '')));
  // חזרה לתרגיל 1: הסטים שנרשמו מוצגים כ"✓ 135 × 10"
  await d1.goTo(1);
  out.ex1Done = await page.locator('.set__done').allInnerTexts();
  // ממשיכים: תרגיל 3 (כיול), ואז סיום
  await d1.goTo(3);
  await d1.setWeight(50);
  for (const i of [1, 2, 3]) await d1.logSet(i, 10);
  await d1.setRir(2);
  await d1.next();
  await d1.finish();
  const file = await d1.export();
  const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
  const w = exp.workouts.filter((x) => x.d === SCENARIO.today);
  out.workoutsToday = w.length;
  out.exercisesWithData = w[0]?.ex.filter((e) => e.sets.some((s) => s.reps !== null || s.seconds !== null)).map((e) => ({ id: e.exerciseId, sets: e.sets.map((s) => [s.weight, s.reps]), rir: e.rir }));
  out.editorAfterFinish = await page.evaluate(() => localStorage.getItem('fatloss:ui:editor'));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
out.pass =
  out.workoutsToday === 1 &&
  out.exercisesWithData?.length === 3 &&
  out.afterLoggedSets === 0 && // תרגיל 3 במוקד — בלי סטים רשומים
  out.afterWhere?.done === 2 &&
  /תרגיל 3 מתוך 8/.test(out.afterWhere?.label ?? '') &&
  out.editorBefore !== null &&
  JSON.parse(out.editorBefore).openId === JSON.parse(out.editorAfterReload).openId;
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
