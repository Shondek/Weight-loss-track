/**
 * שוויון שלב 6 — צ'ק-אין, נתונים, סגירת יום בתזונה.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-6/tools/equivalence.mjs <dist-before> <dist-after> <out-json>
 *
 * על אותה זריעה (שישי 30/10/2026 08:05), בשתי הגרסאות:
 *   A. צ'ק-אין: מילוי כל השדות באותם ערכים → ייצוא. הייצוא זהה; הדוח לצ'אט
 *      והסיכום השבועי שהועתקו זהים; "שתף" (אחרי) שולח את אותו טקסט בדיוק.
 *   B. נתונים: עדכון יעד חלבון מהיום → מזון שלי חדש → עריכת מזון קיים → טעינת
 *      ספריית המנות → ייצוא → ייבוא במיזוג של אותו ייצוא → ייצוא. שני הייצואים
 *      זהים בין הגרסאות (מזהה המזון החדש — uuid — מנורמל).
 *   C. תזונה: סגירת היום מהכותרת (שתי הגרסאות) ומהכפתור התחתון (לפני בלבד) →
 *      ייצוא זהה (`closedAt` מנורמל). אחרי: רק כפתור סגירה אחד במסך.
 */
import fs from 'node:fs';
import { launch, openSeeded, phone, serve } from './lib.mjs';
import { CHECKIN, EDIT_FOOD, NEW_FOOD, driverFor } from './drive.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** נרמול: חותמת הייצוא, uuid של המזון החדש, `closedAt` של היום. */
function normalize(exp) {
  const copy = JSON.parse(JSON.stringify(exp));
  delete copy.exported;
  for (const f of copy.customFoods ?? []) if (f.name === NEW_FOOD.name) f.id = 'c:NEW';
  for (const d of copy.days ?? []) if (d.d === SCENARIO.today && d.closedAt) d.closedAt = 'T';
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

/** stubs ללוח ולשיתוף: מה שהאפליקציה מעתיקה/משתפת נשמר על window. */
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

async function withPage(ctx, server, fn, opts = {}) {
  const page = await openSeeded(ctx, server.url, { ...SCENARIO, ...opts });
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
  const out = { label, errors: [] };
  try {
    const ctx = await phone(browser);
    await ctx.addInitScript(STUBS);

    // ---- בסיס ----
    const base = await withPage(ctx, server, async (page) => ({ exp: read(await driverFor(page, label).export()) }));
    out.baseline = base.exp;
    out.errors.push(...base.errors);

    // ---- A. צ'ק-אין ----
    if (process.env.DEBUG) console.log(label, 'A');
    const a = await withPage(ctx, server, async (page) => {
      const d = driverFor(page, label);
      await d.fillCheckin(CHECKIN);
      const state = await d.checkinState();
      const toast = await d.toastText();
      const report = await d.copyChatReport();
      const weekly = await d.copyWeeklySummary();
      const sharedWeekly = await d.shareWeeklySummary();
      const sharedReport = await d.shareChatReport();
      return { exp: read(await d.export()), state, toast, report, weekly, sharedWeekly, sharedReport };
    });
    out.A = a;
    out.errors.push(...a.errors);

    // ---- B. נתונים ----
    if (process.env.DEBUG) console.log(label, 'B');
    const b = await withPage(ctx, server, async (page) => {
      const d = driverFor(page, label);
      await d.updateProtein();
      const toastTarget = await d.toastText();
      await d.addCustomFood(NEW_FOOD);
      await d.editCustomFood(EDIT_FOOD.name, { kcal: EDIT_FOOD.kcal });
      const library = await d.loadLibrary();
      const exp1Path = await d.export();
      const exp1 = read(exp1Path);
      const merged = await d.importMerge(fs.readFileSync(exp1Path, 'utf8'));
      const exp2 = read(await d.export());
      return { exp1, exp2, toastTarget, library, merged };
    });
    out.B = b;
    out.errors.push(...b.errors);

    // ---- C. תזונה: סגירת יום ----
    if (process.env.DEBUG) console.log(label, 'C');
    const cHeader = await withPage(ctx, server, async (page) => {
      const d = driverFor(page, label);
      const buttonsBefore = await d.closeButtons();
      await d.closeDayHeader();
      const toast = await d.toastText();
      const buttonsAfter = await d.closeButtons();
      return { exp: read(await d.export()), toast, buttonsBefore, buttonsAfter };
    });
    const cBottom = await withPage(ctx, server, async (page) => {
      const d = driverFor(page, label);
      const had = await d.closeDayBottom();
      return had ? { exp: read(await d.export()), had } : { exp: null, had };
    });
    out.C = { header: cHeader, bottom: cBottom };
    out.errors.push(...cHeader.errors, ...cBottom.errors);

    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

const before = await run(distBefore, 4610, 'before');
const after = await run(distAfter, 4611, 'after');

const checkinKeys = (exp) => (exp.checkins ?? []).map((c) => Object.keys(c));
const summary = {
  scenario: SCENARIO,
  values: { checkin: CHECKIN, newFood: NEW_FOOD, editFood: EDIT_FOOD },
  baselineIdentical: same(before.baseline, after.baseline),
  A: {
    exportIdentical: same(before.A.exp, after.A.exp),
    diffs: diff(normalize(before.A.exp), normalize(after.A.exp)),
    checkinRecord: { before: before.A.exp.checkins, after: after.A.exp.checkins },
    checkinKeys: { before: checkinKeys(before.A.exp), after: checkinKeys(after.A.exp) },
    state: { before: before.A.state, after: after.A.state },
    chatReportIdentical: before.A.report !== null && before.A.report === after.A.report,
    weeklySummaryIdentical: before.A.weekly !== null && before.A.weekly === after.A.weekly,
    chatReportLength: { before: before.A.report?.length ?? null, after: after.A.report?.length ?? null },
    weeklySummaryLength: { before: before.A.weekly?.length ?? null, after: after.A.weekly?.length ?? null },
    shareWeekly: { present: after.A.sharedWeekly !== null, sameTextAsCopy: after.A.sharedWeekly?.text === after.A.weekly, keys: after.A.sharedWeekly ? Object.keys(after.A.sharedWeekly) : null },
    shareReport: { present: after.A.sharedReport !== null, sameTextAsCopy: after.A.sharedReport?.text === after.A.report },
    toast: { before: before.A.toast, after: after.A.toast },
    chatReport: after.A.report,
    weeklySummary: after.A.weekly,
  },
  B: {
    export1Identical: same(before.B.exp1, after.B.exp1),
    diffs1: diff(normalize(before.B.exp1), normalize(after.B.exp1)),
    export2Identical: same(before.B.exp2, after.B.exp2),
    diffs2: diff(normalize(before.B.exp2), normalize(after.B.exp2)),
    exportsChangedVsBaseline: !same(before.baseline, before.B.exp1),
    targets: { before: before.B.exp1.targets, after: after.B.exp1.targets },
    customFoodCount: { before: before.B.exp1.customFoods.length, after: after.B.exp1.customFoods.length },
    editedFood: {
      before: before.B.exp1.customFoods.find((f) => f.name === EDIT_FOOD.name)?.kcal,
      after: after.B.exp1.customFoods.find((f) => f.name === EDIT_FOOD.name)?.kcal,
    },
    newFood: {
      before: before.B.exp1.customFoods.find((f) => f.name === NEW_FOOD.name),
      after: after.B.exp1.customFoods.find((f) => f.name === NEW_FOOD.name),
    },
    library: { before: before.B.library, after: after.B.library },
    merged: { before: before.B.merged, after: after.B.merged },
    toastTarget: { before: before.B.toastTarget, after: after.B.toastTarget },
    mergeIdempotent: { before: same(before.B.exp1, before.B.exp2), after: same(after.B.exp1, after.B.exp2) },
    mergeDiffs: { before: diff(normalize(before.B.exp1), normalize(before.B.exp2)), after: diff(normalize(after.B.exp1), normalize(after.B.exp2)) },
  },
  C: {
    headerVsHeader: same(before.C.header.exp, after.C.header.exp),
    diffsHeader: diff(normalize(before.C.header.exp), normalize(after.C.header.exp)),
    bottomBeforeVsHeaderAfter: before.C.bottom.had ? same(before.C.bottom.exp, after.C.header.exp) : null,
    diffsBottom: before.C.bottom.had ? diff(normalize(before.C.bottom.exp), normalize(after.C.header.exp)) : null,
    bottomButtonExists: { before: before.C.bottom.had, after: after.C.bottom.had },
    closeButtons: { before: before.C.header.buttonsBefore, after: after.C.header.buttonsBefore },
    closeButtonsAfterClose: { before: before.C.header.buttonsAfter, after: after.C.header.buttonsAfter },
    toast: { before: before.C.header.toast, after: after.C.header.toast },
    closedVsBaseline: !same(after.baseline, after.C.header.exp),
  },
  errors: { before: before.errors, after: after.errors },
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));
const brief = JSON.parse(JSON.stringify(summary));
delete brief.A.chatReport;
delete brief.A.weeklySummary;
delete brief.A.checkinRecord;
delete brief.B.newFood;
for (const k of ['diffs']) brief.A[k] = brief.A[k].slice(0, 5);
for (const k of ['diffs1', 'diffs2']) brief.B[k] = brief.B[k].slice(0, 5);
console.log(JSON.stringify(brief, null, 1));
