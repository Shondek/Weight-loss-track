/**
 * שוויון יום מלא + ספירת נגיעות + מבנה המועדף.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-4/tools/equivalence.mjs <dist-before> <dist-after> <out-json>
 *
 * בכל גרסה, על אותה זריעה (שישי 30/10/2026 08:05):
 *   1. יום מלא (session.mjs) ואז ייצוא. הייצוא מושווה אחרי נרמול של מה
 *      שמותר להיות שונה: חותמת הייצוא, חותמות זמן (ts, closedAt, at), מזהי
 *      רישום (חותמת + אקראי) ומזהה המזון החדש (uuid) — כמו בשלב 3.
 *   2. ספירת נגיעות: רישום ממועדף (קוטג׳) בכמות שונה מברירת המחדל (+1 יחידה).
 *   3. (חדש בלבד) סימון מועדף → ייצוא: הרשומה במפתח הקיים ובמבנה הקיים.
 */
import fs from 'node:fs';
import { launch, openSeeded, phone, serve } from './lib.mjs';
import { driverFor } from './drive.mjs';
import { runDay } from './session.mjs';

const [, , distBefore, distAfter, outJson] = process.argv;
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };

async function run(dist, port, label) {
  const server = await serve(dist, port);
  const browser = await launch();
  const out = { label, day: null, taps: null, favorite: null, log: [], errors: [] };
  try {
    const ctx = await phone(browser);

    // ---- 1. יום מלא ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      page.on('pageerror', (e) => out.errors.push(String(e.message)));
      const d = driverFor(page, label);
      out.log = await runDay(d);
      const file = await d.export();
      out.day = JSON.parse(fs.readFileSync(file, 'utf8'));
      await page.close();
    }

    // ---- 2. ספירת נגיעות: קוטג׳ ממועדף, +1 (גביע ×1 → ×1½) ----
    {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const d = driverFor(page, label);
      await d.openTab();
      d.counter.reset();
      await d.logFavorite("קוטג'", (q) => q.plus(1));
      out.taps = { clicks: d.counter.clicks, typed: d.counter.typed };
      // ואותו דבר עם צ'יפ כמות (בגרסה החדשה בלבד): "גביע · 250 ג׳" → "כף · 40 ג׳"
      await page.close();
    }

    // ---- 3. מועדף חדש: מה נשמר? ----
    if (label === 'after') {
      const page = await openSeeded(ctx, server.url, SCENARIO);
      const d = driverFor(page, label);
      await d.openTab();
      await d.markFavorite('שקדים');
      const file = await d.export();
      const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
      out.favorite = { favorites: exp.favorites, keys: Object.keys(exp).filter((k) => /favor/i.test(k)) };
      await page.close();
    }
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

/** מסיר את מה שמותר להיות שונה. מחזיר גם את מה שהוסר, לתיעוד. */
function normalize(exp) {
  const copy = JSON.parse(JSON.stringify(exp));
  const stripped = { exported: copy.exported, entryIds: [], customIds: [], closedAt: [], creatineAt: [] };
  delete copy.exported;
  const customMap = new Map();
  for (const f of copy.customFoods ?? []) {
    if (/^c:[0-9a-f-]{36}$/.test(f.id)) {
      stripped.customIds.push(f.id);
      customMap.set(f.id, `c:<uuid-${customMap.size + 1}>`);
      f.id = customMap.get(f.id);
    }
  }
  for (const e of copy.entries ?? []) {
    if (customMap.has(e.foodId)) e.foodId = customMap.get(e.foodId);
    if (!/-seed\d{3}$/.test(e.id)) {
      stripped.entryIds.push({ id: e.id, ts: e.ts });
      e.id = e.id.replace(/^[0-9a-z]{9}-[0-9a-z]{8}$/, '<stamp>-<rand>');
      e.ts = '<ts>';
    }
  }
  for (const d of copy.days ?? []) {
    if (d.d === SCENARIO.today && d.closedAt) {
      stripped.closedAt.push(d.closedAt);
      d.closedAt = '<closedAt>';
    }
  }
  for (const c of copy.creatine ?? []) {
    if (c.d === SCENARIO.today) {
      stripped.creatineAt.push(c.at);
      c.at = '<at>';
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

const before = await run(distBefore, 4410, 'before');
const after = await run(distAfter, 4411, 'after');
const nb = normalize(before.day);
const na = normalize(after.day);
const diffs = diff(nb.copy, na.copy);
const todayEntries = (exp) => (exp.entries ?? []).filter((e) => e.d === SCENARIO.today).map((e) => ({ foodId: e.foodId, grams: e.grams, meal: e.meal, n: e.n ?? null, adhoc: e.adhoc ?? false, ref: e.ref }));
const summary = {
  day: {
    identical: diffs.length === 0,
    diffs,
    stripped: { before: nb.stripped, after: na.stripped },
    todayEntriesAfter: todayEntries(after.day),
    todayEntriesBefore: todayEntries(before.day),
    daysAfter: (after.day.days ?? []).filter((d) => d.d === SCENARIO.today),
    favoritesAfter: after.day.favorites,
    favoritesBefore: before.day.favorites,
    customFoodsAfter: (after.day.customFoods ?? []).filter((f) => !f.id.startsWith('c:seed')),
  },
  taps: { before: before.taps, after: after.taps },
  favoriteRecord: after.favorite,
  log: { before: before.log, after: after.log },
  errors: { before: before.errors, after: after.errors },
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ identical: summary.day.identical, diffs: diffs.slice(0, 30), taps: summary.taps, favoriteRecord: summary.favoriteRecord, errors: summary.errors, logAfter: after.log }, null, 1));
