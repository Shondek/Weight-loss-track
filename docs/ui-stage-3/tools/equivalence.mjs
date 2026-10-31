/**
 * שוויון סשן מלא + שוויון עריכה + ספירת נגיעות.
 *
 *   node docs/ui-stage-3/tools/equivalence.mjs <dist-before> <dist-after> <out-json>
 *
 * בכל גרסה, על אותה זריעה (שישי 30/10/2026 08:05, הבא בתור A):
 *   1. סשן A שלם (session.mjs) ואז ייצוא.
 *   2. עריכת אימון עבר (C של 28/10): חזרות בסט 2 של התרגיל הראשון 12 → 11,
 *      כאב ברך → 3, סגירה, ייצוא.
 *   3. ספירת נגיעות לתרגיל של 3 סטים שבו ההצעה מתקבלת כמו שהיא (A1).
 * הייצוא מושווה אחרי הסרת `exported`, ומזהה האימון החדש (שמכיל סיומת
 * אקראית) מנורמל.
 */
import fs from 'node:fs';
import { launch, openSeeded, phone, serve, settle } from './lib.mjs';
import { driverFor } from './drive.mjs';
import { runSession } from './session.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };

async function run(dist, port, label) {
  const server = await serve(dist, port);
  const browser = await launch();
  const out = { label, session: null, edit: null, taps: null, log: [], errors: [] };
  try {
    const ctx = await phone(browser);

    // ---- 1. סשן מלא ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      page.on('pageerror', (e) => out.errors.push(String(e.message)));
      const d = driverFor(page, label);
      out.log = await runSession(d);
      const file = await d.export();
      out.session = JSON.parse(fs.readFileSync(file, 'utf8'));
      await page.close();
    }

    // ---- 2. עריכת אימון עבר ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const d = driverFor(page, label);
      await d.openTab();
      await d.editWorkout('28/10');
      await d.goTo(1);
      const input = page.getByLabel(/^חזרות, סט 2 — /);
      if (label === 'after') {
        // סט שנרשם: נגיעה פותחת לעריכה, ואז −1.
        await page.locator('.set').nth(1).locator('.set__done').click();
        await settle(page, 150);
      }
      await input.fill('11');
      await input.blur();
      await settle(page, 150);
      await d.pain(3, null);
      await d.close();
      const file = await d.export();
      out.edit = JSON.parse(fs.readFileSync(file, 'utf8'));
      await page.close();
    }

    // ---- 3. ספירת נגיעות: A1, ההצעה כמו שהיא ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const d = driverFor(page, label);
      await d.openTab();
      await d.start('A');
      await d.goTo(1);
      d.counter.reset();
      await d.useSuggestion();
      for (const i of [1, 2, 3]) await d.logSet(i, 10);
      await d.setRir(2);
      await d.next();
      out.taps = { clicks: d.counter.clicks, typed: d.counter.typed };
      await page.close();
    }
    // ---- 4. כאב שלא נגעו בו: מה נשמר? (בדיקת ברירת המחדל) ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const d = driverFor(page, label);
      await d.openTab();
      await d.start('A');
      await d.goTo(1);
      await d.useSuggestion();
      await d.logSet(1, 10);
      await d.close();
      const file = await d.export();
      const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
      const w = exp.workouts.find((x) => x.d === SCENARIO.today && !x.id.includes('seed'));
      out.painUntouched = w ? { knee: w.knee, shoulder: w.shoulder, hasKneeKey: 'knee' in w, hasShoulderKey: 'shoulder' in w } : null;
      await page.close();
    }
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

/** מסיר את מה שמותר להיות שונה: חותמת הייצוא, והסיומת האקראית במזהה האימון החדש. */
function normalize(exp, scenarioDay) {
  const copy = JSON.parse(JSON.stringify(exp));
  const stripped = { exported: copy.exported, newIds: [] };
  delete copy.exported;
  for (const w of copy.workouts ?? []) {
    if (w.d === scenarioDay && !w.id.includes('seed')) {
      stripped.newIds.push(w.id);
      // המזהה = תאריך + חותמת זמן (בסיס 36) + אקראי + סוג. החותמת והאקראי מותרים להיות שונים.
      w.id = w.id.replace(/^(\d{4}-\d{2}-\d{2})-[0-9a-z]{9}-[0-9a-f]{8}-([A-D])$/, '$1-<stamp>-<rand>-$2');
    }
  }
  return { copy, stripped };
}

function diff(a, b, pathStr = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    out.push({ path: pathStr || '/', before: a, after: b });
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${pathStr}/${k}`, out);
  return out;
}

const before = await run(distBefore, 4310, 'before');
const after = await run(distAfter, 4311, 'after');
const nbS = normalize(before.session, SCENARIO.today);
const naS = normalize(after.session, SCENARIO.today);
const nbE = normalize(before.edit, SCENARIO.today);
const naE = normalize(after.edit, SCENARIO.today);
const sessionDiffs = diff(nbS.copy, naS.copy);
const editDiffs = diff(nbE.copy, naE.copy);
const newWorkout = (exp) => exp.workouts.find((w) => w.d === SCENARIO.today && !w.id.includes('seed'));
const summary = {
  session: { identical: sessionDiffs.length === 0, diffs: sessionDiffs, stripped: { before: nbS.stripped, after: naS.stripped }, workoutAfter: newWorkout(after.session), workoutBefore: newWorkout(before.session) },
  edit: { identical: editDiffs.length === 0, diffs: editDiffs, editedAfter: after.edit.workouts.find((w) => w.d === '2026-10-28') },
  taps: { before: before.taps, after: after.taps },
  log: { before: before.log, after: after.log },
  errors: { before: before.errors, after: after.errors },
  painUntouched: { before: before.painUntouched, after: after.painUntouched },
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ session: summary.session.identical, sessionDiffs: sessionDiffs.slice(0, 20), edit: summary.edit.identical, editDiffs: editDiffs.slice(0, 20), taps: summary.taps, painUntouched: summary.painUntouched, errors: summary.errors }, null, 1));
