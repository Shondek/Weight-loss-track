/**
 * שוויון נתונים לשלב 7 — "לפני" (הבסיס) מול "אחרי" (הענף), על אותה זריעה
 * (רביעי 11/11/2026 08:05) ואותן פעולות דרך drive.mjs.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-7/tools/equivalence.mjs <dist-before> <dist-after> <out-json>
 *
 *   A. golden: ייצוא הבסיס (בלי אף פעולה) זהה בשתי הגרסאות.
 *   B. סשן אימון A מלא: חימום 8 דק׳, הצעה כמו שהיא, סט שונה מההצעה, כיול,
 *      "דלג ואחזור", "החלף", משקל גוף, בלי RIR, פלאנק, כאב, אירובי סיום → ייצוא.
 *   C. עריכת אימון עבר (C של 04/11): חזרות בסט 2, כאב ברך → ייצוא.
 *   D. מחיקה ו"בטל" לכל סוג רשומה: ייצוא → מחיקה → "בטל" → ייצוא; ומחיקה בלי "בטל".
 *   E. ייבוא (מיזוג) של גיבוי ישן — קובץ ה-golden של הבדיקות — למכשיר ריק → ייצוא.
 *   F. הטקסטים לצ'אט: הסיכום השבועי ודוח הצ'ק-אין, לפני מול אחרי.
 *   G. שקילה + צעדי אתמול: אותו ייצוא; ספירת נגיעות והאם השדה במסך בלי גלילה.
 *   H. ספירת נגיעות: תרגיל של 3 סטים שההצעה מתקבלת בו כמו שהיא; חימום.
 *
 * ההשוואה ב-JSON.stringify אחרי הסרת `exported` ונרמול המזהה של האימון החדש
 * (חותמת זמן + אקראי). סדר המערכים וסדר המפתחות נספרים.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openSeeded, phone, serve, settle } from './lib.mjs';
import { CLIPBOARD_STUB, driverFor } from './drive.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = fs.readFileSync(path.join(HERE, '../../../src/lib/__tests__/fixtures/backup-golden-before.json'), 'utf8');
const SCENARIO = { today: '2026-11-11', time: '08:05:00' };

const SESSION = {
  type: 'A',
  warmup: 8,
  exercises: [
    { n: 1, sets: [undefined, undefined, undefined], rir: 2 }, // A1: ההצעה כמו שהיא
    { n: 2, sets: [undefined, 7, undefined], rir: 1 }, // A2: סט 2 שונה מההצעה
    { n: 3, weight: 50, sets: [10, 10, 9], rir: 2 }, // A3: כיול — אין היסטוריה
    { n: 4, skip: true }, // A4: דלג ואחזור → לסוף
    { n: 4, swap: 'כפיפת ברכיים במכונה על הבטן', weight: 30, sets: [12, 12], rir: 3 }, // A5: החלף
    { n: 5, sets: [17, 17, 17], rir: 2 }, // A6: משקל גוף כפתיחה
    { n: 6, sets: [15, 15, 15], noRir: true }, // A7: בלי RIR
    { n: 7, sets: [60, 60, 60], rir: 2 }, // A8: פלאנק
    { n: 8, sets: [15, 15], rir: 2 }, // A4 שחזר לסוף
  ],
  pain: { knee: 2, shoulder: 0 },
  finisher: { mode: 'אופניים', minutes: 30, incline: 2, speed: 5.5, elapsed: 20 },
};

async function runSession(d) {
  const log = [];
  await d.openTab('אימונים');
  await d.start(SESSION.type);
  await d.warmup(SESSION.warmup);
  for (const step of SESSION.exercises) {
    await d.goTo(step.n);
    const name = await d.exerciseName();
    if (step.skip) {
      await d.skip();
      log.push({ n: step.n, name, action: 'skip' });
      continue;
    }
    if (step.swap) await d.swapTo(step.swap);
    if (step.weight !== undefined) await d.setWeight(step.weight);
    for (const [i, v] of step.sets.entries()) await d.logSet(i + 1, v);
    if (step.noRir) await d.nextWithoutRir();
    else {
      await d.setRir(step.rir);
      await d.next();
    }
    log.push({ n: step.n, name: step.swap ? `${name} → ${step.swap}` : name, rir: step.noRir ? null : step.rir });
  }
  await d.pain(SESSION.pain.knee, SESSION.pain.shoulder);
  await d.finisher(SESSION.finisher);
  await d.finish();
  return log;
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

async function run(dist, port, label) {
  const server = await serve(dist, port);
  const browser = await launch();
  const out = { label, errors: [] };
  const open = async (scenario = SCENARIO, opts = {}) => {
    const page = await openSeeded(ctx, server.url, scenario, { init: CLIPBOARD_STUB, ...opts });
    page.on('pageerror', (e) => out.errors.push(String(e.message)));
    return page;
  };
  let ctx;
  try {
    ctx = await phone(browser);

    // ---- A. golden: ייצוא הבסיס ----
    {
      const page = await open();
      out.baseline = read(await driverFor(page, label).export());
      await page.close();
    }

    // ---- B. סשן מלא ----
    {
      const page = await open();
      const d = driverFor(page, label);
      out.sessionLog = await runSession(d);
      out.session = read(await d.export());
      await page.close();
    }

    // ---- C. עריכת אימון עבר ----
    {
      const page = await open();
      const d = driverFor(page, label);
      await d.openTab('אימונים');
      await d.editWorkout('04/11');
      await d.goTo(1);
      await page.locator('.set').nth(1).locator('.set__done').click();
      await settle(page, 150);
      const input = page.getByLabel(/^חזרות, סט 2 — /);
      await input.fill('11');
      await input.blur();
      await settle(page, 150);
      await d.pain(3, null);
      await d.close();
      out.edit = read(await d.export());
      await page.close();
    }

    // ---- D. מחיקה ו"בטל" ----
    out.deletes = {};
    const DELETES = [
      ['weight', (d) => d.deleteWeight('09/11/2026')],
      ['waist', (d) => d.deleteWaist('2026-11-04', '04/11/2026')],
      ['steps', (d) => d.deleteSteps('10/11/2026')],
      ['entry', (d) => d.deleteEntry("גבינת קוטג'")],
      ['standalone', (d) => d.deleteStandalone()],
      ['workout', (d) => d.deleteWorkout('06/11')],
      ['customFood', (d) => d.deleteCustomFood('PRO 40 יטבתה')],
    ];
    for (const [kind, act] of DELETES) {
      // עם "בטל"
      {
        const page = await open();
        const d = driverFor(page, label);
        await act(d);
        const toast = await d.toastText();
        await d.undo();
        const undone = read(await d.export());
        out.deletes[kind] = { toast, undone };
        await page.close();
      }
      // בלי "בטל"
      {
        const page = await open();
        const d = driverFor(page, label);
        await act(d);
        await d.letToastExpire();
        out.deletes[kind].deleted = read(await d.export());
        await page.close();
      }
    }

    // ---- E. ייבוא גיבוי ישן (golden) למכשיר ריק ----
    {
      const page = await open(SCENARIO, { seed: false });
      const d = driverFor(page, label);
      out.importLine = await d.importMerge(GOLDEN);
      out.imported = read(await d.export());
      await page.close();
    }

    // ---- F. הטקסטים לצ'אט ----
    {
      const page = await open();
      const d = driverFor(page, label);
      out.weeklySummary = await d.copyWeeklySummary();
      out.chatReport = await d.copyChatReport();
      await page.close();
    }
    // F2. שבוע שבו המותניים נמדדו בשישי בלבד (06/11 במקום רביעי 04/11) — ממצא 5.
    {
      const page = await open({ ...SCENARIO, waistSkip: ['2026-11-04'], waistExtra: ['2026-11-06'] });
      const d = driverFor(page, label);
      out.weeklySummaryFriday = await d.copyWeeklySummary();
      await page.close();
    }

    // ---- G. שקילה + צעדי אתמול ----
    {
      const page = await open({ ...SCENARIO, noStepsYesterday: true });
      const d = driverFor(page, label);
      d.counter.reset();
      await d.saveWeight();
      out.weightTaps = d.counter.get();
      out.stepsTaps = await d.saveStepsYesterday(8450);
      out.morning = read(await d.export());
      await page.close();
    }

    // ---- H. ספירת נגיעות: תרגיל של 3 סטים, ההצעה כמו שהיא; חימום ----
    {
      const page = await open();
      const d = driverFor(page, label);
      await d.openTab('אימונים');
      await d.start('A');
      out.warmupTaps = await d.warmup(8);
      await d.goTo(1);
      d.counter.reset();
      for (const i of [1, 2, 3]) await d.logSet(i);
      await d.setRir(2);
      await d.next();
      out.exerciseTaps = d.counter.get();
      await page.close();
    }
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

/** מסיר את מה שמותר להיות שונה: חותמת הייצוא, והחותמת + האקראי במזהה האימון החדש. */
function normalize(exp) {
  const copy = JSON.parse(JSON.stringify(exp));
  delete copy.exported;
  for (const w of copy.workouts ?? []) {
    if (w.d === SCENARIO.today && !w.id.includes('seed')) {
      w.id = w.id.replace(/^(\d{4}-\d{2}-\d{2})-[0-9a-z]{9}-[0-9a-f]{8}-([A-D])$/, '$1-<stamp>-<rand>-$2');
    }
  }
  // closedAt / at נכתבים מהשעון האמיתי של המכונה, לא מהשעון המותקן בדף.
  return copy;
}
function diff(a, b, at = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    out.push({ path: at || '/', before: a, after: b });
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}/${k}`, out);
  return out;
}
const same = (a, b) => {
  const d = diff(normalize(a), normalize(b));
  return { identical: JSON.stringify(normalize(a)) === JSON.stringify(normalize(b)), diffs: d.slice(0, 20) };
};
/** השורות שהשתנו בין שני טקסטים, לפי מספר שורה. */
function lineDiff(a, b) {
  const la = (a ?? '').split('\n');
  const lb = (b ?? '').split('\n');
  const out = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) out.push({ line: i + 1, before: la[i] ?? null, after: lb[i] ?? null });
  return out;
}

const before = await run(distBefore, 4710, 'before');
const after = await run(distAfter, 4711, 'after');

const deletes = {};
for (const kind of Object.keys(after.deletes)) {
  deletes[kind] = {
    toast: after.deletes[kind].toast,
    // "בטל" מחזיר בדיוק את הבסיס (באותה גרסה), והתוצאה זהה בין הגרסאות.
    undoRestoresBaseline: same(after.baseline, after.deletes[kind].undone),
    undoneBeforeVsAfter: same(before.deletes[kind].undone, after.deletes[kind].undone),
    deletedBeforeVsAfter: same(before.deletes[kind].deleted, after.deletes[kind].deleted),
    deleteReallyWritten: !same(after.baseline, after.deletes[kind].deleted).identical,
  };
}

const newWorkout = (exp) => exp.workouts.find((w) => w.d === SCENARIO.today && !w.id.includes('seed'));
const summary = {
  scenario: SCENARIO,
  A_baseline: same(before.baseline, after.baseline),
  B_session: { ...same(before.session, after.session), workout: newWorkout(after.session), log: after.sessionLog },
  C_edit: { ...same(before.edit, after.edit), changedVsBaseline: !same(after.baseline, after.edit).identical },
  D_deletes: deletes,
  E_importOldBackup: { ...same(before.imported, after.imported), line: { before: before.importLine, after: after.importLine }, counts: Object.fromEntries(Object.entries(after.imported).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])) },
  F_texts: {
    weeklySummary: { identical: before.weeklySummary === after.weeklySummary, chars: after.weeklySummary?.length ?? null, changedLines: lineDiff(before.weeklySummary, after.weeklySummary) },
    chatReport: { identical: before.chatReport === after.chatReport, chars: after.chatReport?.length ?? null, changedLines: lineDiff(before.chatReport, after.chatReport) },
    weeklySummaryFridayWaist: { identical: before.weeklySummaryFriday === after.weeklySummaryFriday, changedLines: lineDiff(before.weeklySummaryFriday, after.weeklySummaryFriday) },
  },
  G_morning: { ...same(before.morning, after.morning), weightTaps: { before: before.weightTaps, after: after.weightTaps }, stepsTaps: { before: before.stepsTaps, after: after.stepsTaps } },
  H_taps: { exercise: { before: before.exerciseTaps, after: after.exerciseTaps }, warmup: { before: before.warmupTaps, after: after.warmupTaps } },
  errors: { before: before.errors, after: after.errors },
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));

const brief = {
  A_baseline: summary.A_baseline.identical,
  B_session: summary.B_session.identical,
  B_diffs: summary.B_session.diffs,
  C_edit: summary.C_edit.identical,
  C_diffs: summary.C_edit.diffs,
  D: Object.fromEntries(Object.entries(deletes).map(([k, v]) => [k, [v.undoRestoresBaseline.identical, v.undoneBeforeVsAfter.identical, v.deletedBeforeVsAfter.identical, v.deleteReallyWritten].join('/')])),
  E_import: summary.E_importOldBackup.identical,
  E_line: summary.E_importOldBackup.line,
  F: { weekly: summary.F_texts.weeklySummary.identical, chat: summary.F_texts.chatReport.identical, friday: summary.F_texts.weeklySummaryFridayWaist },
  G: { identical: summary.G_morning.identical, diffs: summary.G_morning.diffs, weightTaps: summary.G_morning.weightTaps, stepsTaps: summary.G_morning.stepsTaps },
  H: summary.H_taps,
  errors: summary.errors,
};
console.log(JSON.stringify(brief, null, 1));
