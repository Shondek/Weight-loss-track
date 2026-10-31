/**
 * שוויון מחיקה והחזרה (שלב 5).
 *
 *   PW_PATH=<playwright> node docs/ui-stage-5/tools/equivalence.mjs <dist-before> <dist-after> <out-json>
 *
 * על אותה זריעה (שישי 30/10/2026 08:05), לכל סוג רשומה מהמיפוי:
 *   A. (אחרי) ייצוא → מחיקה → "בטל" → ייצוא. שני הייצואים זהים לחלוטין,
 *      כולל סדר המערכים וסדר המפתחות (רק `exported` מנורמל).
 *   B. (לפני מול אחרי) מחיקה בלי "בטל", אחרי שהטוסט נעלם → ייצוא זהה.
 *   C. (אחרי) מזון שלי שמופיע ברישומים: טקסט מסך התזונה לפני → מחיקה (הטקסט
 *      משתנה) → "בטל" → הטקסט חוזר להיות זהה, והייצוא זהה לבסיס.
 *   D. (אחרי) שתי מחיקות ברצף: "בטל" מחזיר רק את השנייה; הייצוא זהה למחיקה
 *      של הראשונה בלבד.
 */
import fs from 'node:fs';
import { launch, openSeeded, phone, serve } from './lib.mjs';
import { driverFor } from './drive.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };

/** המחיקות, לפי המיפוי. `label` = מה בדיוק נמחק. */
const DELETIONS = [
  { type: 'שקילה', label: '27/10/2026 (באמצע "שקילות אחרונות")', act: (d) => d.deleteWeight('27/10/2026') },
  { type: 'מותניים', label: '21/10/2026 (האחרונה)', act: (d) => d.deleteWaist('2026-10-21', '21/10/2026') },
  { type: 'צעדים', label: 'אתמול 29/10/2026', act: (d) => d.deleteSteps('29/10/2026') },
  { type: 'רישום מזון', label: "קוטג' של היום 07:10", act: (d) => d.deleteEntry("קוטג'") },
  { type: 'אירובי עצמאי', label: '28/10 הליכון 45 דק׳', act: (d) => d.deleteStandalone() },
  { type: 'אימון שלם', label: '26/10 (באמצע ההיסטוריה)', act: (d) => d.deleteWorkout('26/10') },
  { type: 'מזון מותאם', label: 'PRO 40 (מופיע ברישומים של 14 יום)', act: (d) => d.deleteCustomFood('PRO 40') },
];

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function normalize(exp) {
  const copy = JSON.parse(JSON.stringify(exp));
  delete copy.exported;
  return copy;
}
function diff(a, b, pathStr = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    out.push({ path: pathStr || '/', a, b });
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${pathStr}/${k}`, out);
  return out;
}
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

async function withPage(ctx, server, fn) {
  const page = await openSeeded(ctx, server.url, SCENARIO);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  try {
    const r = await fn(page);
    return { ...r, errors };
  } finally {
    await page.close();
  }
}

async function run(dist, port, label) {
  const server = await serve(dist, port);
  const browser = await launch();
  const out = { label, baseline: null, A: [], B: [], C: null, D: null, errors: [] };
  try {
    const ctx = await phone(browser);
    // בסיס: ייצוא בלי שום פעולה.
    out.baseline = (await withPage(ctx, server, async (page) => ({ exp: read(await driverFor(page, label).export()) }))).exp;

    for (const del of DELETIONS) {
      if (process.env.DEBUG) console.log(label, del.type);
      // ---- B. מחיקה בלי "בטל" (שתי הגרסאות) ----
      const b = await withPage(ctx, server, async (page) => {
        const d = driverFor(page, label);
        await del.act(d);
        const toast = await d.toastText();
        await d.letToastExpire();
        await page.locator('.toast:not(.toast--static)').waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined);
        const toastAfter = await d.toastText();
        return { exp: read(await d.export()), toast, toastAfter };
      });
      out.B.push({ type: del.type, label: del.label, exp: b.exp, toast: b.toast, toastAfter: b.toastAfter, errors: b.errors });
      out.errors.push(...b.errors);

      // ---- A. מחיקה ואז "בטל" (אחרי בלבד) ----
      if (label === 'after') {
        const a = await withPage(ctx, server, async (page) => {
          const d = driverFor(page, label);
          await del.act(d);
          const toast = await d.toastText();
          await d.undo();
          const toastAfterUndo = await d.toastText();
          return { exp: read(await d.export()), toast, toastAfterUndo };
        });
        out.A.push({ type: del.type, label: del.label, identical: same(out.baseline, a.exp), diffs: diff(normalize(out.baseline), normalize(a.exp)), toast: a.toast, toastAfterUndo: a.toastAfterUndo, errors: a.errors });
        out.errors.push(...a.errors);
      }
    }

    if (label === 'after') {
      // ---- C. מזון שלי שמופיע ברישומים ----
      const c = await withPage(ctx, server, async (page) => {
        const d = driverFor(page, label);
        await d.openTab('תזונה');
        const t0 = await page.locator('main').innerText();
        await d.deleteCustomFood('PRO 40');
        await d.openTab('תזונה');
        const t1 = await page.locator('main').innerText();
        await d.undo();
        const t2 = await page.locator('main').innerText();
        return { exp: read(await d.export()), t0, t1, t2 };
      });
      out.C = {
        screenChangedWhileDeleted: c.t0 !== c.t1,
        screenRestored: c.t0 === c.t2,
        exportIdentical: same(out.baseline, c.exp),
        diffs: diff(normalize(out.baseline), normalize(c.exp)),
        mentionsPro40: { before: (c.t0.match(/PRO 40/g) ?? []).length, deleted: (c.t1.match(/PRO 40/g) ?? []).length, restored: (c.t2.match(/PRO 40/g) ?? []).length },
        errors: c.errors,
      };

      // ---- D. שתי מחיקות ברצף ----
      const firstOnly = await withPage(ctx, server, async (page) => {
        const d = driverFor(page, label);
        await d.deleteWeight('29/10/2026');
        await d.letToastExpire();
        return { exp: read(await d.export()) };
      });
      const dd = await withPage(ctx, server, async (page) => {
        const d = driverFor(page, label);
        await d.deleteWeight('29/10/2026');
        const toast1 = await d.toastText();
        await d.deleteWeight('27/10/2026');
        const toast2 = await d.toastText();
        const toasts = await page.locator('.toast:not(.toast--static)').count();
        await d.undo();
        return { exp: read(await d.export()), toast1, toast2, toasts };
      });
      const has = (exp, d) => exp.weights.some((w) => w.d === d);
      out.D = {
        toast1: dd.toast1,
        toast2: dd.toast2,
        toastsVisibleAfterSecond: dd.toasts,
        firstStillDeleted: !has(dd.exp, '2026-10-29'),
        secondRestored: has(dd.exp, '2026-10-27'),
        identicalToFirstOnly: same(firstOnly.exp, dd.exp),
        diffs: diff(normalize(firstOnly.exp), normalize(dd.exp)),
        errors: [...firstOnly.errors, ...dd.errors],
      };
    }
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

const before = await run(distBefore, 4510, 'before');
const after = await run(distAfter, 4511, 'after');

const summary = {
  scenario: SCENARIO,
  A: after.A.map(({ type, label, identical, diffs, toast, toastAfterUndo }) => ({ type, label, identical, diffs, toast, toastAfterUndo })),
  B: DELETIONS.map((del, i) => {
    const b = before.B[i];
    const a = after.B[i];
    return { type: del.type, label: del.label, identical: same(b.exp, a.exp), diffs: diff(normalize(b.exp), normalize(a.exp)), toastBefore: b.toast, toastAfter: a.toast, toastGoneAfterExpiry: a.toastAfter === null, changedVsBaseline: !same(after.baseline, a.exp) };
  }),
  C: after.C,
  D: after.D,
  baselineIdentical: same(before.baseline, after.baseline),
  errors: { before: before.errors, after: after.errors },
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));
console.log(
  JSON.stringify(
    {
      A: summary.A.map((x) => ({ type: x.type, identical: x.identical, toast: x.toast, diffs: x.diffs.slice(0, 5) })),
      B: summary.B.map((x) => ({ type: x.type, identical: x.identical, changedVsBaseline: x.changedVsBaseline, toastGone: x.toastGoneAfterExpiry, toastBefore: x.toastBefore, toastAfter: x.toastAfter, diffs: x.diffs.slice(0, 5) })),
      C: summary.C && { ...summary.C, diffs: summary.C.diffs.slice(0, 5) },
      D: summary.D && { ...summary.D, diffs: summary.D.diffs.slice(0, 5) },
      baselineIdentical: summary.baselineIdentical,
      errors: summary.errors,
    },
    null,
    1,
  ),
);
