/**
 * שוויון "סגור יום → בטל" מול "לא נסגר בכלל".
 *
 *   node docs/ui-stage-2/tools/undo-equivalence.mjs <dist> <out-json> <shots-dir>
 *
 * אותה זריעה (רביעי 28/10/2026 08:05, שקילה קיימת). ריצה א': ייצוא בלי לגעת.
 * ריצה ב': "סגור יום" → "בטל" בטוסט → ייצוא. ההשוואה מסירה רק `exported`.
 * בדרך: צילום של האריחים ושל הטוסט.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, openSeeded, phone, serve, settle } from './lib.mjs';

const [, , dist, outJson, shotsDir] = process.argv;
fs.mkdirSync(shotsDir, { recursive: true });
const SCENARIO = { today: '2026-10-28', time: '08:05:00', weighToday: true };

async function exportJson(page) {
  await page.getByRole('tab', { name: 'נתונים' }).click();
  await settle(page, 500);
  const dl = page.waitForEvent('download');
  const btn = page.getByRole('button', { name: 'הורד קובץ גיבוי' });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  const file = await (await dl).path();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const server = await serve(dist, 4320);
const browser = await launch();
let untouched, undone, toastSeen, closedBetween;
try {
  const ctx = await phone(browser);
  // א. לא נסגר בכלל.
  let page = await openSeeded(ctx, server.url, SCENARIO);
  untouched = await exportJson(page);
  await page.close();

  // ב. סגירה → בטל.
  page = await openSeeded(ctx, server.url, SCENARIO);
  await page.locator('.tiles').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 200);
  await page.locator('.tiles').screenshot({ path: path.join(shotsDir, '13-tiles-fix.png') });
  const close = page.getByRole('button', { name: /^סגור יום$/ });
  await close.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await close.click();
  await settle(page, 400);
  toastSeen = (await page.locator('.toast').count()) === 1;
  closedBetween = await page.evaluate(() => document.body.innerText.includes('היום סגור'));
  await page.screenshot({ path: path.join(shotsDir, '14-day-closed-toast.png'), fullPage: false });
  await page.locator('.toast').screenshot({ path: path.join(shotsDir, '14-toast--crop.png') });
  await page.locator('.toast').getByRole('button', { name: 'בטל' }).click();
  await settle(page, 400);
  undone = await exportJson(page);
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

const strip = (e) => {
  const c = JSON.parse(JSON.stringify(e));
  delete c.exported;
  return c;
};
function diff(a, b, p = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    out.push({ path: p || '/', untouched: a, afterUndo: b });
    return out;
  }
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) diff(a?.[k], b?.[k], `${p}/${k}`, out);
  return out;
}
const diffs = diff(strip(untouched), strip(undone));
const today = SCENARIO.today;
const summary = {
  identical: diffs.length === 0,
  diffs,
  toastSeen,
  closedBetween,
  dayRecordUntouched: untouched.days.find((d) => d.d === today) ?? null,
  dayRecordAfterUndo: undone.days.find((d) => d.d === today) ?? null,
  daysCount: { untouched: untouched.days.length, afterUndo: undone.days.length },
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
