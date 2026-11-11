/**
 * משקל שונה לסט (PR 2) — בדיקה בדפדפן, צילומים, ותאימות לגרסה הישנה.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-7/tools/set-weight.mjs <dist-pr2> <out-dir> <out-json>
 *
 * על build של PR 2, שבת 14/11/2026 08:05 (כדי שהסיכום השבועי יהיה של השבוע):
 *   1. אימון B, "כפיפת ברכיים": 85×10, ירידה ב-stepper הראשי ל-80, 80×11, 80×10 — 85/80/80.
 *   2. הסט במשקל אחר מסומן; ייצוא; הסיכום השבועי והדוח לצ'אט מציגים סט-סט.
 *   3. האימון הבא: ההצעה מחושבת מ-80, עם "אשר בעצמך".
 *   4. משקל לסט בודד דרך החלונית (80/80/75), "חזור למשקל התרגיל", עריכת אימון ישן.
 *   5. פרופיל בת הזוג: אותו ממשק.
 * גיבוי חדש בגרסה הישנה נבדק בנפרד: old-version.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checks, launch, openSeeded, phone, serve, settle, tab } from './lib.mjs';
import { CLIPBOARD_STUB, driverFor } from './drive.mjs';

const [, , distNew, outDir, outJson] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const SAT = { today: '2026-11-14', time: '08:05:00' };
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const out = { errors: [] };

const serverNew = await serve(distNew, 4760);
const browser = await launch();
try {
  const ctx = await phone(browser);
  const open = async (server, scenario, opts = {}) => {
    const page = await openSeeded(ctx, server.url, scenario, { init: CLIPBOARD_STUB, ...opts });
    page.on('pageerror', (e) => out.errors.push(String(e.message)));
    return page;
  };
  const shot = async (page, name, clip) => {
    await page.screenshot({ path: path.join(outDir, `${name}.png`), ...(clip ? { clip } : {}) });
    const c = await checks(page);
    return { smallTargets: c.smallTargets, smallTargetsList: c.smallTargetsList, contrastFails: c.contrastFails.length, contrastMin: c.contrastMin, hscroll: c.hscroll, flippedNums: c.flippedNums };
  };
  const mainWeight = (page) => page.getByLabel(/^משקל — /);
  const setRows = async (page) => (await page.locator('.focus__sets .set').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  const setMain = async (page, w) => {
    await mainWeight(page).fill(String(w));
    await mainWeight(page).blur();
    await settle(page, 250);
  };

  // ---- 1–2. הסשן 85/80/80 ----
  {
    const page = await open(serverNew, SAT);
    const d = driverFor(page, 'after');
    await d.openTab('אימונים');
    await d.start('B');
    await d.goTo(4);
    out.exercise = await d.exerciseName();
    await setMain(page, 85);
    d.counter.reset();
    await d.logSet(1, 10);
    const afterSet1 = d.counter.get();
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    // ירדתי באמצע: ה-stepper הראשי 85 → 80. סט 1 (שנרשם) נשאר 85.
    await setMain(page, 80);
    out.mainChanged = { rows: await setRows(page), hint: (await page.locator('.focus__weight-hint').innerText().catch(() => '')).replace(/\s+/g, ' ').trim() };
    out.checks_mainChanged = await shot(page, '01-main-changed-after-set-1');
    await d.logSet(2, 11);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await d.logSet(3, 10);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await d.setRir(2);
    await settle(page, 300);
    out.session = { rows: await setRows(page), tapsForSet1: afterSet1, hintGoneAfterLog: (await page.locator('.focus__weight-hint').count()) === 0 };
    await page.locator('.focus__sets').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -160));
    await settle(page, 250);
    out.checks_logged = await shot(page, '02-set-with-different-weight');
    await d.next();
    await d.close();

    // הסיכום במסך (צ'ק-אין), ואז הטקסטים.
    await tab(page, "צ'ק-אין");
    // השבוע כולל שני אימוני B (שני 09/11 מהזריעה, והסשן של היום) — בוחרים את של היום.
    const row = page.locator('.listrow', { hasText: '85×10' }).first();
    await row.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -200));
    await settle(page, 250);
    out.checks_summary = await shot(page, '03-weekly-summary-on-screen');
    out.summaryOnScreen = (await row.innerText()).replace(/\s+/g, ' ').trim();
    const weekly = await d.copyWeeklySummary();
    out.weeklySummaryLine = weekly.split('\n').find((l) => l.includes('כפיפת ברכיים 85')) ?? null;
    // אימון B של יום שני באותו שבוע, במשקל אחד — מוצג כמו תמיד.
    out.weeklySummaryUniformLine = weekly.split('\n').find((l) => l.includes('כפיפת ברכיים') && !l.includes('85')) ?? null;
    out.weeklySummaryChars = weekly.length;
    const chat = await d.copyChatReport();
    out.chatReportHasLine = chat.includes('כפיפת ברכיים 85×10 · 80×11 · 80×10');
    fs.writeFileSync(path.join(outDir, 'weekly-summary.txt'), weekly);

    const w = read(await d.export()).workouts.find((x) => x.d === SAT.today && !x.id.includes('seed'));
    const curl = w.ex.find((e) => e.exerciseId === 'leg-curl');
    out.stored = { sets: curl.sets, rir: curl.rir, setKeys: [...new Set(curl.sets.flatMap((s) => Object.keys(s)))].sort(), exerciseKeys: Object.keys(curl).sort() };

    // ---- 3. האימון הבא: ההצעה ----
    await d.openTab('אימונים');
    await d.start('B');
    await d.goTo(4);
    const panel = page.getByRole('note', { name: 'הצעה' });
    out.nextSuggestion = { text: (await panel.innerText()).replace(/\s+/g, ' ').trim(), mainWeight: await mainWeight(page).inputValue() };
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 250);
    out.checks_suggestion = await shot(page, '04-next-session-suggestion');
    // הגרף וההיסטוריה: הסט הכבד נשאר.
    await page.locator('.wk-prev .disc__head').click();
    await settle(page, 250);
    out.previousLine = (await page.locator('.wk-prev .disc__sum').innerText()).replace(/\s+/g, ' ').trim();
    await page.close();
  }

  // ---- 4. משקל לסט בודד דרך החלונית: 80/80/75; "חזור למשקל התרגיל" ----
  {
    const page = await open(serverNew, SAT);
    const d = driverFor(page, 'after');
    await d.openTab('אימונים');
    await d.start('B');
    await d.goTo(4);
    await setMain(page, 80);
    await d.logSet(1, 12);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await d.logSet(2, 12);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    d.counter.reset();
    await page.getByRole('button', { name: /^משקל לסט 3/ }).click();
    await settle(page, 300);
    const sheet = page.locator('.sheet');
    out.sheet = { title: (await sheet.locator('.sheet__title').innerText()).trim(), resetDisabledBefore: await sheet.getByRole('button', { name: 'חזור למשקל התרגיל' }).isDisabled() };
    const field = sheet.getByLabel(/^משקל, סט 3/);
    await field.fill('75');
    await field.blur();
    await settle(page, 200);
    out.checks_sheet = await shot(page, '05-set-weight-sheet');
    out.sheet.resetEnabledAfter = !(await sheet.getByRole('button', { name: 'חזור למשקל התרגיל' }).isDisabled());
    // "חזור למשקל התרגיל" ואז שוב 75.
    await sheet.getByRole('button', { name: 'חזור למשקל התרגיל' }).click();
    await settle(page, 200);
    out.sheet.afterReset = await field.inputValue();
    await field.fill('75');
    await field.blur();
    await sheet.getByRole('button', { name: 'סיום' }).click();
    await settle(page, 300);
    out.sheet.pendingRow = (await setRows(page))[2];
    // ה-stepper הראשי לא דורס סט עם משקל משלו.
    await setMain(page, 82.5);
    out.sheet.afterMainChange = (await setRows(page))[2];
    await setMain(page, 80);
    await d.logSet(3, 12);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    out.sheet.rows = await setRows(page);
    await d.setRir(2);
    await d.next();
    await d.close();
    const w = read(await d.export()).workouts.find((x) => x.d === SAT.today && !x.id.includes('seed'));
    out.sheet.stored = w.ex.find((e) => e.exerciseId === 'leg-curl').sets;
    await page.close();
  }

  // ---- 4ב. עריכת אימון ישן: משקל לסט אחד, ו"החל גם עליהם" ----
  {
    const page = await open(serverNew, SAT);
    const d = driverFor(page, 'after');
    await d.openTab('אימונים');
    await d.editWorkout('09/11'); // B של שני
    await d.goTo(2); // חתירת כבל, 3 סטים
    const before = await setRows(page);
    // נגיעה בסט שנרשם פותחת עריכה; שם כפתור המשקל.
    await page.locator('.set').nth(0).locator('.set__done').click();
    await settle(page, 200);
    await page.getByRole('button', { name: /^משקל לסט 1/ }).click();
    await settle(page, 250);
    const field = page.locator('.sheet').getByLabel(/^משקל, סט 1/);
    const original = await field.inputValue();
    await field.fill(String(Number(original) + 5));
    await field.blur();
    await page.locator('.sheet').getByRole('button', { name: 'סיום' }).click();
    await settle(page, 250);
    await page.getByRole('button', { name: 'סיום עריכה — סט 1' }).click();
    await settle(page, 250);
    const afterOne = await setRows(page);
    // ה-stepper הראשי באימון ישן: לא נוגע בסטים שנרשמו, ומציע "החל גם עליהם".
    await setMain(page, Number(original) - 5);
    const afterMain = await setRows(page);
    const hint = (await page.locator('.focus__weight-hint').innerText()).replace(/\s+/g, ' ').trim();
    await page.getByRole('button', { name: 'החל גם עליהם' }).click();
    await settle(page, 250);
    out.editOld = { original, before, afterOne, afterMain, hint, afterApply: await setRows(page) };
    await page.close();
  }

  // ---- 5. בת הזוג ----
  {
    const page = await open(serverNew, { ...SAT, profile: 'partner' });
    await page.getByRole('button', { name: /^התחל אימון/ }).first().click();
    await settle(page, 400);
    await page.getByRole('button', { name: /^רשום סט 1/ }).click();
    await settle(page, 300);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await page.getByRole('button', { name: /^משקל לסט 2/ }).click();
    await settle(page, 250);
    const field = page.locator('.sheet').getByLabel(/^משקל, סט 2/);
    const main = Number(await field.inputValue());
    await field.fill(String(main - 5));
    await field.blur();
    await page.locator('.sheet').getByRole('button', { name: 'סיום' }).click();
    await settle(page, 250);
    await page.getByRole('button', { name: /^רשום סט 2/ }).click();
    await settle(page, 300);
    await page.getByRole('button', { name: 'דלג', exact: true }).click();
    await settle(page, 250);
    out.partner = { rows: await setRows(page) };
    out.checks_partner = await shot(page, '06-partner-set-with-different-weight');
    await page.close();
  }

  await ctx.close();
} finally {
  await browser.close();
  serverNew.close();
}
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
