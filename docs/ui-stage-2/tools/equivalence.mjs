/**
 * שוויון פעולות + ספירת נגיעות.
 *
 *   node docs/ui-stage-2/tools/equivalence.mjs <dist-before> <dist-after> <out-json>
 *
 * בכל גרסה, על אותה זריעה (רביעי 28/10/2026 08:05, בלי שקילה היום):
 *   1. שקילה: + אחד בסטפר ואז "שמור שקילה".
 *   2. סגירת היום ("סגור יום" במסך היום / "סיימתי לרשום היום" בתזונה).
 *   3. מותניים: − אחד בסטפר ואז "שמור מדידה".
 *   4. ייצוא: "הורד קובץ גיבוי" במסך נתונים.
 * הייצוא מושווה אחרי הסרת `exported` וחותמות הזמן (`closedAt`).
 *
 * נגיעות לשקילת בוקר: מפתיחת האפליקציה עד שמירה, כשהערך הוא ברירת המחדל
 * (השקילה האחרונה). נספרות לחיצות; מצוין בנפרד אם כפתור השמירה היה מחוץ
 * ל-viewport הראשוני (כלומר נדרשה גלילה).
 */
import fs from 'node:fs';
import { launch, openSeeded, phone, serve, settle } from './lib.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-10-28', time: '08:05:00' };

async function run(dist, port, label) {
  const server = await serve(dist, port);
  const browser = await launch();
  const out = { label, taps: {}, export: null, steps: [] };
  try {
    const ctx = await phone(browser);

    // ---- ספירת נגיעות לשקילת בוקר (ערך ברירת מחדל) ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const save = page.getByRole('button', { name: /שמור שקילה/ });
      const box = await save.boundingBox();
      const inViewport = box !== null && box.y >= 0 && box.y + box.height <= 844;
      let clicks = 0;
      if (!inViewport) await save.scrollIntoViewIfNeeded();
      await save.click();
      clicks++;
      await settle(page, 300);
      const saved = await page.evaluate(() => document.body.innerText.includes('נשמר'));
      out.taps.defaultValue = { clicks, saveButtonInInitialViewport: inViewport, saveButtonY: box ? Math.round(box.y) : null, saved };
      await page.close();
    }
    // ---- נגיעות כשצריך לתקן ב-0.1 (+ אחד) ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const plus = page.getByRole('button', { name: 'הוסף 0.1' }).first();
      const save = page.getByRole('button', { name: /שמור שקילה/ });
      const box = await save.boundingBox();
      const inViewport = box !== null && box.y >= 0 && box.y + box.height <= 844;
      if (!inViewport) await save.scrollIntoViewIfNeeded();
      await plus.click();
      await save.click();
      out.taps.plusOne = { clicks: 2, saveButtonInInitialViewport: inViewport };
      await page.close();
    }

    // ---- שוויון פעולות ----
    const page = await openSeeded(ctx, server.url, SCENARIO);
    // 1. שקילה: + אחד ואז שמירה.
    const plus = page.getByRole('button', { name: 'הוסף 0.1' }).first();
    await plus.scrollIntoViewIfNeeded();
    await plus.click();
    const save = page.getByRole('button', { name: /שמור שקילה|עדכן שקילה/ });
    await save.click();
    await settle(page, 300);
    out.steps.push('weigh');

    // 2. סגירת היום.
    let close = page.getByRole('button', { name: /^סגור יום$/ });
    if ((await close.count()) === 0) {
      await page.getByRole('tab', { name: 'תזונה' }).click();
      await settle(page, 400);
      close = page.getByRole('button', { name: /סיימתי לרשום היום/ });
    }
    await close.scrollIntoViewIfNeeded();
    await close.click();
    await settle(page, 300);
    out.steps.push('close-day');

    // 3. מותניים: חזרה לטאב הראשון, − אחד ואז שמירה.
    await page.getByRole('tab', { name: /^(היום|משקל)$/ }).click();
    await settle(page, 400);
    const minus = page.getByRole('button', { name: 'הפחת 0.5' }).first();
    await minus.scrollIntoViewIfNeeded();
    await minus.click();
    const saveWaist = page.getByRole('button', { name: /שמור מדידה|עדכן מדידה/ });
    await saveWaist.click();
    await settle(page, 300);
    out.steps.push('waist');

    // 4. ייצוא.
    await page.getByRole('tab', { name: 'נתונים' }).click();
    await settle(page, 500);
    const dl = page.waitForEvent('download');
    const btn = page.getByRole('button', { name: 'הורד קובץ גיבוי' });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const download = await dl;
    const file = await download.path();
    out.export = JSON.parse(fs.readFileSync(file, 'utf8'));
    out.steps.push('export');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

function normalize(exp) {
  const copy = JSON.parse(JSON.stringify(exp));
  const stripped = { exported: copy.exported, closedAt: [] };
  delete copy.exported;
  for (const d of copy.days ?? []) {
    if (d.closedAt) {
      stripped.closedAt.push(d.closedAt);
      delete d.closedAt;
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
const nb = normalize(before.export);
const na = normalize(after.export);
const diffs = diff(nb.copy, na.copy);
const summary = {
  identical: diffs.length === 0,
  diffs,
  strippedBefore: nb.stripped,
  strippedAfter: na.stripped,
  counts: Object.fromEntries(Object.entries(na.copy).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v])),
  weighedBefore: before.export.weights.find((w) => w.d === SCENARIO.today),
  weighedAfter: after.export.weights.find((w) => w.d === SCENARIO.today),
  waistBefore: before.export.waist.find((w) => w.d === SCENARIO.today),
  waistAfter: after.export.waist.find((w) => w.d === SCENARIO.today),
  dayBefore: before.export.days.find((w) => w.d === SCENARIO.today),
  dayAfter: after.export.days.find((w) => w.d === SCENARIO.today),
  taps: { before: before.taps, after: after.taps },
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ identical: summary.identical, diffs: summary.diffs, taps: summary.taps, weighedAfter: summary.weighedAfter, waistAfter: summary.waistAfter, dayAfter: summary.dayAfter }, null, 1));
