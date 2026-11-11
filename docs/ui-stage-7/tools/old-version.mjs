/**
 * גיבוי חדש (עם סט במשקל ייחודי) בגרסה הישנה — מה בדיוק קורה (PR 2).
 *
 *   PW_PATH=<playwright> node docs/ui-stage-7/tools/old-version.mjs <dist-old> <dist-pr2> <out-json> [screenshot.png]
 *
 * `dist-old` = build של ענף הבסיס (לפני שלב 7). התרחיש: שבת 14/11/2026.
 *   1. ב-PR 2: אימון B → ייצוא (S). שלושה תרגילים עם משקל ייחודי:
 *        תרגיל 4 "כפיפת ברכיים" 85×10 · 80×11 · 80×10, RIR 2 (ירידה ב-stepper הראשי);
 *        תרגיל 2 "חתירת כבל" 80×12 · 80×12 · 75×12, RIR 2 (משקל משלו לסט האחרון);
 *        תרגיל 3 "פרפר" 50×12 · 45×12, והסט השלישי **לא נרשם** (תרגיל באמצע).
 *   2. S מיובא (מיזוג) למכשיר ריק בגרסה הישנה → ייצוא (O).
 *      S מיובא באותו אופן למכשיר ריק ב-PR 2 → ייצוא (N) — קבוצת הביקורת.
 *   3. הבדלים שדה-שדה: S מול O (מה הייבוא משנה), ו-O מול N (מה הגרסה משנה).
 *   4. הסיכום השבועי והדוח לצ'אט, שורה-שורה: הגרסה הישנה מול PR 2, על אותו ייבוא.
 *   5. בגרסה הישנה: ייצוא חוזר; עריכת חזרות בסט; רישום הסט החסר; שינוי ה-stepper
 *      הראשי — מה קורה למשקל הייחודי בכל אחד.
 */
import fs from 'node:fs';
import { launch, openSeeded, phone, serve, settle } from './lib.mjs';
import { CLIPBOARD_STUB, driverFor } from './drive.mjs';

const [, , distOld, distNew, outJson, screenshot] = process.argv;
const SAT = { today: '2026-11-14', time: '08:05:00' };
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const out = { errors: { old: [], pr2: [] } };

function diff(a, b, at = '', acc = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return acc;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    acc.push({ path: at || '/', a, b });
    return acc;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}/${k}`, acc);
  return acc;
}
function lineDiff(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  const acc = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) acc.push({ line: i + 1, old: la[i] ?? null, pr2: lb[i] ?? null });
  return acc;
}
/** כל סט שבוצע, בכל האימונים: מזהה אימון, תרגיל, מספר סט, משקל, חזרות/שניות, ו-RIR של התרגיל. */
function performedSets(db) {
  const rows = [];
  for (const w of db.workouts) {
    for (const e of w.ex) {
      e.sets.forEach((s, i) => {
        if (s.reps !== null || s.seconds !== null) rows.push(`${w.id}|${e.exerciseId}|${i}|w=${s.weight}|r=${s.reps}|s=${s.seconds}|rir=${e.rir ?? '-'}`);
      });
    }
  }
  return rows.sort();
}
const mainWeight = (page) => page.getByLabel(/^משקל — /);
const exOf = (db, id) => db.workouts.find((x) => x.d === SAT.today && !x.id.includes('seed')).ex.find((e) => e.exerciseId === id);
const curlOf = (db) => exOf(db, 'leg-curl');
const setMain = async (page, w) => {
  await mainWeight(page).fill(String(w));
  await mainWeight(page).blur();
  await settle(page, 250);
};
const skipRest = (page) => page.getByRole('button', { name: 'דלג', exact: true }).click();

const serverNew = await serve(distNew, 4770);
const serverOld = await serve(distOld, 4771);
const browser = await launch();
try {
  const ctx = await phone(browser);
  const open = async (server, key, opts = {}) => {
    const page = await openSeeded(ctx, server.url, SAT, { init: CLIPBOARD_STUB, ...opts });
    page.on('pageerror', (e) => out.errors[key].push(String(e.message)));
    return page;
  };

  // ---- 1. המקור: סשן 85/80/80 ב-PR 2 ----
  let sourceText;
  {
    const page = await open(serverNew, 'pr2');
    const d = driverFor(page, 'after');
    await d.openTab('אימונים');
    await d.start('B');
    await d.goTo(4);
    await mainWeight(page).fill('85');
    await mainWeight(page).blur();
    await settle(page, 250);
    await d.logSet(1, 10);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await mainWeight(page).fill('80');
    await mainWeight(page).blur();
    await settle(page, 250);
    await d.logSet(2, 11);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await d.logSet(3, 10);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await d.setRir(2);
    await d.next();
    // תרגיל 2, חתירת כבל: 80×12, 80×12, ולסט האחרון משקל משלו — 75×12. RIR 2.
    await d.goTo(2);
    await setMain(page, 80);
    await d.logSet(1, 12);
    await skipRest(page);
    await d.logSet(2, 12);
    await skipRest(page);
    await page.getByRole('button', { name: /^משקל לסט 3/ }).click();
    await settle(page, 250);
    const own = page.locator('.sheet').getByLabel(/^משקל, סט 3/);
    await own.fill('75');
    await own.blur();
    await page.locator('.sheet').getByRole('button', { name: 'סיום' }).click();
    await settle(page, 250);
    await d.logSet(3, 12);
    await skipRest(page);
    await d.setRir(2);
    await d.next();
    // תרגיל 3, פרפר: 50×12, ירידה ל-45, 45×12 — והסט השלישי נשאר בלי רישום.
    await d.goTo(3);
    await setMain(page, 50);
    await d.logSet(1, 12);
    await skipRest(page);
    await setMain(page, 45);
    await d.logSet(2, 12);
    await skipRest(page);
    await d.close();
    sourceText = fs.readFileSync(await d.export(), 'utf8');
    await page.close();
  }
  const S = JSON.parse(sourceText);

  // ---- 2. ייבוא למכשיר ריק: בגרסה הישנה (O) וב-PR 2 (N) ----
  const importInto = async (server, key, version) => {
    const page = await open(server, key, { seed: false });
    const d = driverFor(page, version);
    const line = await d.importMerge(sourceText);
    const exported = read(await d.export());
    const weekly = await d.copyWeeklySummary();
    const chat = await d.copyChatReport();
    return { page, d, line, exported, weekly, chat };
  };
  const oldSide = await importInto(serverOld, 'old', 'before');
  const newSide = await importInto(serverNew, 'pr2', 'after');
  const O = oldSide.exported;
  const N = newSide.exported;

  // ---- 3. הבדלים שדה-שדה ----
  const strip = (db) => {
    const copy = JSON.parse(JSON.stringify(db));
    delete copy.exported;
    return copy;
  };
  const sourceVsOld = diff(strip(S), strip(O));
  out.import = {
    line: { old: oldSide.line, pr2: newSide.line },
    // מה הייבוא משנה מול הקובץ (בגרסה הישנה).
    sourceVsOld: { count: sourceVsOld.length, byKey: Object.fromEntries([...new Set(sourceVsOld.map((x) => x.path.split('/')[1]))].map((k) => [k, sourceVsOld.filter((x) => x.path.split('/')[1] === k).length])), sample: sourceVsOld.slice(0, 12) },
    // מה הגרסה משנה: אותו ייבוא, הגרסה הישנה מול PR 2.
    oldVsPr2: { identical: JSON.stringify(strip(O)) === JSON.stringify(strip(N)), diffs: diff(strip(O), strip(N)).slice(0, 12) },
    // כל סט שבוצע: משקל, חזרות, שניות, RIR — הקובץ מול הגרסה הישנה.
    performedSets: { source: performedSets(S).length, old: performedSets(O).length, identical: JSON.stringify(performedSets(S)) === JSON.stringify(performedSets(O)) },
    workouts: { source: S.workouts.length, old: O.workouts.length },
    quarantineOld: O.quarantine.length,
    mixedExercises: Object.fromEntries(
      ['leg-curl', 'seated-cable-row', 'pec-deck'].map((id) => [
        id,
        { source: exOf(S, id).sets, old: exOf(O, id).sets, rir: { source: exOf(S, id).rir ?? null, old: exOf(O, id).rir ?? null }, identical: JSON.stringify(exOf(S, id)) === JSON.stringify(exOf(O, id)) },
      ]),
    ),
    // הסטים שהייבוא השמיט: מה היה בהם בקובץ.
    droppedByImport: sourceVsOld
      .filter((x) => /\/sets\/\d+$/.test(x.path) && x.b === undefined)
      .map((x) => {
        const [, , wi, , ei] = x.path.split('/');
        const ex = S.workouts[Number(wi)].ex[Number(ei)];
        return { exercise: ex.n, bodyweightOnly: ex.bodyweightOnly, set: x.a, exercisePerformedSets: ex.sets.filter((s) => s.reps !== null || s.seconds !== null).length };
      }),
  };

  // ---- 4. הסיכום השבועי והדוח לצ'אט: הגרסה הישנה מול PR 2, אותו ייבוא ----
  out.texts = {
    weeklySummary: { linesOld: oldSide.weekly.split('\n').length, linesPr2: newSide.weekly.split('\n').length, changedLines: lineDiff(oldSide.weekly, newSide.weekly) },
    chatReport: { changedLines: lineDiff(oldSide.chat, newSide.chat) },
  };
  await newSide.page.close();

  // ---- 5. בגרסה הישנה: מה קורה למשקל הייחודי ----
  {
    const { page, d } = oldSide;
    const weightsOf = (db) => curlOf(db).sets.map((s) => s.weight);
    const repsOf = (db) => curlOf(db).sets.map((s) => s.reps);
    // (א) ייצוא חוזר, בלי לגעת בכלום.
    const again = read(await d.export());
    // (ב) פותחים את האימון בגרסה הישנה ומתקנים חזרות בסט 2 (11 → 12).
    await d.openTab('אימונים');
    await d.editWorkout('14/11');
    await d.goTo(4);
    const shown = { mainStepper: await mainWeight(page).inputValue(), rows: (await page.locator('.focus__sets .set').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()) };
    if (screenshot) await page.screenshot({ path: screenshot });
    await page.locator('.set').nth(1).locator('.set__done').click();
    await settle(page, 150);
    const input = page.getByLabel(/^חזרות, סט 2 — /);
    await input.fill('12');
    await input.blur();
    await settle(page, 200);
    await d.close();
    const afterReps = read(await d.export());
    // (ג) משנים את ה-stepper הראשי (80 → 82.5): בגרסה הישנה הוא כותב לכל הסטים.
    await d.openTab('אימונים');
    await d.editWorkout('14/11');
    await d.goTo(4);
    await mainWeight(page).fill('82.5');
    await mainWeight(page).blur();
    await settle(page, 250);
    await d.close();
    const afterMain = read(await d.export());
    // (ד) "פרפר" נרשם חלקית (50×12, 45×12, סט 3 חסר). רישום הסט החסר בגרסה הישנה:
    //     שם "רשום" כותב את משקל התרגיל לכל הסטים (R2 הישן).
    const pecBefore = exOf(afterMain, 'pec-deck').sets;
    await d.openTab('אימונים');
    await d.editWorkout('14/11');
    await d.goTo(3);
    const pecMain = await mainWeight(page).inputValue();
    await d.logSet(3, 12);
    await skipRest(page);
    await d.close();
    const afterLog = read(await d.export());
    out.oldVersionBehaviour = {
      loggingMissingSet: { mainStepper: pecMain, before: pecBefore, after: exOf(afterLog, 'pec-deck').sets, uniqueWeightKept: exOf(afterLog, 'pec-deck').sets[0].weight === 50 },
      shown,
      reExport: { weights: weightsOf(again), reps: repsOf(again), rir: curlOf(again).rir, uniqueWeightKept: JSON.stringify(weightsOf(again)) === '[85,80,80]' },
      afterEditingReps: { weights: weightsOf(afterReps), reps: repsOf(afterReps), rir: curlOf(afterReps).rir, uniqueWeightKept: JSON.stringify(weightsOf(afterReps)) === '[85,80,80]' },
      afterChangingMainStepper: { weights: weightsOf(afterMain), reps: repsOf(afterMain), rir: curlOf(afterMain).rir, uniqueWeightKept: JSON.stringify(weightsOf(afterMain)) === '[85,80,80]' },
    };
    await page.close();
  }
  await ctx.close();
} finally {
  await browser.close();
  serverNew.close();
  serverOld.close();
}
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
