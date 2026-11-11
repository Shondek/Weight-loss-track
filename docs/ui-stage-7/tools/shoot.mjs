/**
 * צילומים (390×844 @2x) + בדיקות DOM לשלב 7, לגרסה אחת (לפני או אחרי).
 *
 *   PW_PATH=<playwright> node docs/ui-stage-7/tools/shoot.mjs <dist-dir> <out-dir> <checks-json> <before|after>
 *
 * אותה זריעה (רביעי 11/11/2026 08:05) ואותו שעון כמו בכלי השוויון. לכל צילום
 * נרשמות בדיקות ה-DOM: RTL, גלילה אופקית, אזורי מגע < 44, ניגודיות, מספרים
 * שלא ב-LTR מבודד, ושגיאות JS. `--crop` = 230 הפיקסלים התחתונים (פס הטיימר).
 */
import fs from 'node:fs';
import path from 'node:path';
import { advance, checks, launch, openSeeded, phone, serve, settle, tab } from './lib.mjs';
import { driverFor } from './drive.mjs';
import { OLD_SWAPPED_B } from './seed.mjs';

const [, , dist, outDir, checksJson, version = 'after'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const WED = { today: '2026-11-11', time: '08:05:00' };
const FRI = { today: '2026-11-13', time: '08:05:00' };
const PARTNER = { ...WED, profile: 'partner' };
const before = version === 'before';
const CROP = { x: 0, y: 844 - 230, width: 390, height: 230 };

const top = (page) => page.evaluate(() => window.scrollTo(0, 0));
async function scrollTo(page, locator) {
  await page.evaluate((el) => el.scrollIntoView({ block: 'start' }), await locator.first().elementHandle());
  await settle(page, 250);
}
/** נגיעה בלי הגלילה האוטומטית של Playwright — המסך נשאר איפה שהמשתמש רואה אותו. */
const tap = async (page, name) => {
  await page.getByRole('button', { name }).first().dispatchEvent('click');
  await settle(page, 900);
};
const startWorkout = async (page, d, t = null) => {
  await tab(page, 'אימונים');
  if (t) await d.start(t);
  else await page.getByRole('button', { name: /^התחל אימון/ }).first().click();
  await settle(page, 400);
};

const SCENARIOS = [
  {
    id: '01-today-morning',
    title: 'היום, בוקר: לפני השקילה, צעדי אתמול עוד לא הוזנו',
    seed: { ...WED, noStepsYesterday: true },
    act: async () => undefined,
  },
  {
    id: '02-today-steps-entered',
    title: 'היום: אחרי השקילה, צעדי אתמול קיימים',
    seed: WED,
    act: async (d, page) => {
      await d.saveWeight();
      await advance(page, 2500);
      await top(page);
    },
  },
  {
    id: '03-today-friday-waist',
    title: 'היום, שישי בלי מדידת מותניים השבוע: האריח',
    seed: FRI,
    act: async (d, page) => {
      await scrollTo(page, page.getByRole('group', { name: 'מדדי החלטה' }));
      await page.evaluate(() => window.scrollBy(0, -120));
    },
  },
  {
    id: '04-workout-start',
    title: 'אימונים: מסך הפתיחה',
    seed: WED,
    act: async (d, page) => tab(page, 'אימונים'),
  },
  {
    id: '05-exercise-enter',
    title: 'אימון: כניסה לתרגיל הראשון (חימום בראש)',
    seed: WED,
    act: async (d, page) => startWorkout(page, d),
  },
  {
    id: '06-exercise-2-with-timer',
    title: 'אימון: כניסה לתרגיל השני בזמן מנוחה — "רשום סט 1" מול הקפל',
    seed: WED,
    act: async (d, page) => {
      await startWorkout(page, d);
      for (const i of [1, 2, 3]) await d.logSet(i);
      await d.setRir(2);
      await d.next();
      await top(page);
    },
    measure: true,
  },
  {
    id: '07-after-set-1',
    title: 'אימון: מיד אחרי "רשום סט 1" (בלי גלילה ביד) — הסט הבא ופס הטיימר',
    seed: WED,
    act: async (d, page) => {
      await startWorkout(page, d);
      await tap(page, /^רשום סט 1/);
    },
    measure: true,
  },
  {
    id: '08-rir-after-last-set',
    title: 'אימון: מיד אחרי הסט האחרון (בלי גלילה ביד) — ה-RIR',
    seed: WED,
    act: async (d, page) => {
      await startWorkout(page, d);
      for (const i of [1, 2, 3]) await tap(page, new RegExp(`^רשום סט ${i}`));
    },
    measure: true,
  },
  {
    id: '09-timer-rest',
    title: 'פס הטיימר: מנוחה בין סטים',
    seed: WED,
    crop: true,
    act: async (d, page) => {
      await startWorkout(page, d);
      await d.logSet(1);
      await advance(page, 12000);
    },
  },
  {
    id: '10-timer-before-next-exercise',
    title: 'פס הטיימר: מנוחה לפני התרגיל הבא (הכיתוב שנשבר)',
    seed: WED,
    crop: true,
    act: async (d, page) => {
      await startWorkout(page, d);
      for (const i of [1, 2, 3]) await d.logSet(i);
      await settle(page, 300);
    },
  },
  {
    id: '11-timer-warmup',
    title: 'פס הטיימר: חימום (ספירה לאחור, 8 דק׳)',
    seed: WED,
    crop: true,
    act: async (d, page) => {
      await startWorkout(page, d);
      await d.warmup(8);
      await advance(page, 5000);
    },
  },
  {
    id: '12-timer-finished',
    title: 'פס הטיימר: שנייה אחרי סוף המנוחה (האפליקציה פתוחה)',
    seed: WED,
    crop: true,
    act: async (d, page) => {
      await startWorkout(page, d);
      await d.logSet(1);
      await advance(page, 61500);
    },
  },
  {
    id: '13-timer-ended-in-background',
    title: 'פס הטיימר: חוזרים לאפליקציה 40 שניות אחרי שהמנוחה נגמרה ברקע',
    seed: WED,
    crop: true,
    act: async (d, page) => {
      await startWorkout(page, d);
      await d.logSet(1);
      // רקע: הזמן קופץ 100 שניות בלי אף טיק (כמו דף מוקפא), ואז טיק אחד.
      await page.clock.fastForward(100_000);
      await settle(page, 400);
    },
  },
  {
    id: '14-warmup-open',
    title: 'אימון: שורת החימום פתוחה',
    seed: WED,
    act: async (d, page) => {
      await startWorkout(page, d);
      await page.locator('.disc__head', { hasText: 'חימום' }).click();
      await settle(page, 250);
    },
  },
  {
    id: '15-finish-cardio',
    title: 'אימון: שלב הסיום — אירובי לפני "התחל"',
    seed: WED,
    act: async (d, page) => {
      await startWorkout(page, d);
      await d.goTo('finish');
      await top(page);
    },
  },
  {
    id: '16-cardio-running',
    title: 'אימון: ריצת אירובי פעילה, 12:34 מההתחלה (אחרי: סטופר)',
    seed: WED,
    act: async (d, page) => {
      await startWorkout(page, d);
      await d.goTo('finish');
      const region = page.getByRole('region', { name: 'סיום האימון' });
      if (!before) {
        await region.getByRole('group', { name: /^טיימר — אירובי/ }).getByRole('button', { name: 'סטופר' }).click();
        await settle(page, 150);
      }
      await region.getByRole('button', { name: 'התחל', exact: true }).click();
      await settle(page, 300);
      await advance(page, (12 * 60 + 34) * 1000);
      await top(page);
    },
  },
  {
    id: '17-old-workout-rows',
    title: 'עריכת אימון B ישן (26/10, לפני שינוי התוכנית; B5 הוחלף): רשימת התרגילים',
    seed: { ...WED, oldProgram: true },
    act: async (d, page) => {
      await tab(page, 'אימונים');
      const dm = `${OLD_SWAPPED_B.slice(8)}/${OLD_SWAPPED_B.slice(5, 7)}`;
      await d.editWorkout(dm);
      await page.locator('.wk-head__title').click();
      await settle(page, 300);
    },
    extra: async (d, page) => ({ rows: (await page.locator('.sheet .listrow .listrow__title').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()) }),
  },
  {
    id: '18-nutrition-milk',
    title: 'תזונה: "מה אכלתי" עם שורת החלב של שייק (250 ג׳)',
    seed: { ...WED, milk: true },
    act: async (d, page) => {
      await tab(page, 'תזונה');
      await scrollTo(page, page.getByRole('region', { name: /^מה אכלתי/ }));
      await page.evaluate(() => window.scrollBy(0, -200));
    },
    extra: async (d, page) => ({ milkRow: (await page.getByRole('region', { name: /^מה אכלתי/ }).locator('.listrow', { hasText: 'חלב' }).first().innerText()).replace(/\s+/g, ' ').trim() }),
  },
  {
    id: '19-today-active-workout',
    title: 'היום: כשיש אימון פתוח (שורת האימון)',
    seed: WED,
    act: async (d, page) => {
      await startWorkout(page, d);
      await d.logSet(1);
      await page.getByRole('button', { name: 'דלג', exact: true }).click();
      await tab(page, 'היום');
      await scrollTo(page, page.locator('[aria-label="מצב היום"]'));
    },
  },
  { id: '20-checkin', title: "צ'ק-אין — בלי שינוי (בדיקות DOM)", seed: WED, full: true, act: async (d, page) => tab(page, "צ'ק-אין") },
  { id: '21-data', title: 'נתונים — בלי שינוי (בדיקות DOM)', seed: WED, full: true, act: async (d, page) => tab(page, 'נתונים') },
  { id: '22-nutrition', title: 'תזונה — הדף המלא', seed: WED, full: true, act: async (d, page) => tab(page, 'תזונה') },
  // ---- פרופיל בת הזוג: כל מסך שהיא רואה ----
  { id: '30-partner-start', title: 'בת הזוג: אימונים — מסך הפתיחה', seed: PARTNER, act: async () => undefined },
  {
    id: '31-partner-exercise',
    title: 'בת הזוג: תרגיל במוקד',
    seed: PARTNER,
    act: async (d, page) => {
      await page.getByRole('button', { name: /^התחל אימון/ }).first().click();
      await settle(page, 400);
    },
  },
  {
    id: '32-partner-timer',
    title: 'בת הזוג: אחרי "רשום סט 1" — פס הטיימר',
    seed: PARTNER,
    act: async (d, page) => {
      await page.getByRole('button', { name: /^התחל אימון/ }).first().click();
      await settle(page, 400);
      await tap(page, /^רשום סט 1/);
    },
    measure: true,
  },
  {
    id: '33-partner-finish',
    title: 'בת הזוג: שלב הסיום',
    seed: PARTNER,
    act: async (d, page) => {
      await page.getByRole('button', { name: /^התחל אימון/ }).first().click();
      await settle(page, 400);
      await d.logSet(1);
      await page.getByRole('button', { name: 'דלג', exact: true }).click();
      await d.goTo('finish');
      await top(page);
    },
  },
  { id: '34-partner-data', title: 'בת הזוג: נתונים', seed: PARTNER, full: true, act: async (d, page) => tab(page, 'נתונים') },
];

/** איפה כפתור "רשום סט" וה-RIR ביחס לקצה הנראה (מעל פס הטיימר / הניווט). */
async function fold(page) {
  return page.evaluate(() => {
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const logBtn = rect([...document.querySelectorAll('button')].find((b) => /^רשום סט/.test(b.textContent.trim()) && b.classList.contains('btn--primary')));
    const rir = rect(document.querySelector('.wk-rir'));
    const visibleBottom = Math.round((rect(document.querySelector('.resttimer')) ?? rect(document.querySelector('nav.tabs'))).top);
    const pos = (r) => (r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= visibleBottom } : null);
    return { visibleBottom, scrollY: Math.round(window.scrollY), logSet: pos(logBtn), rir: pos(rir) };
  });
}

const server = await serve(dist, before ? 4720 : 4721);
const browser = await launch();
const results = [];
try {
  const ctx = await phone(browser);
  for (const sc of SCENARIOS) {
    const errors = [];
    const page = await openSeeded(ctx, server.url, sc.seed);
    page.on('pageerror', (e) => errors.push(String(e.message)));
    const d = driverFor(page, version);
    await sc.act(d, page);
    await settle(page, 300);
    const file = path.join(outDir, `${sc.id}${sc.crop ? '--crop' : sc.full ? '--full' : ''}.png`);
    await page.screenshot({ path: file, ...(sc.crop ? { clip: CROP } : {}), fullPage: sc.full === true });
    const c = await checks(page);
    results.push({
      id: sc.id,
      title: sc.title,
      dir: c.dir,
      hscroll: c.hscroll,
      scrollHeight: c.scrollHeight,
      font: c.font,
      smallTargets: c.smallTargets,
      smallTargetsList: c.smallTargetsList,
      contrastMin: c.contrastMin,
      contrastFails: c.contrastFails,
      flippedNums: c.flippedNums,
      jsErrors: errors,
      ...(sc.measure ? { fold: await fold(page) } : {}),
      ...(sc.extra ? await sc.extra(d, page) : {}),
      ...(page.locator('.resttimer').count ? { timerBar: await page.evaluate(() => {
        const el = document.querySelector('.resttimer');
        if (!el) return null;
        const label = el.querySelector('.resttimer__label, .tiny.muted, .resttimer__done');
        return { height: Math.round(el.getBoundingClientRect().height), text: el.innerText.replace(/\s+/g, ' ').trim(), labelLines: label ? Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight)) : null };
      }) } : {}),
    });
    await page.close();
  }
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

const summary = {
  version,
  scenarios: results.length,
  hscroll: results.filter((r) => r.hscroll).length,
  smallTargets: results.reduce((s, r) => s + r.smallTargets, 0),
  contrastFails: results.reduce((s, r) => s + r.contrastFails.length, 0),
  contrastMin: Math.min(...results.map((r) => r.contrastMin).filter((v) => v !== null)),
  flippedNums: results.reduce((s, r) => s + r.flippedNums, 0),
  jsErrors: results.reduce((s, r) => s + r.jsErrors.length, 0),
  notRtl: results.filter((r) => r.dir !== 'rtl').length,
};
fs.writeFileSync(checksJson, JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary));
for (const r of results) {
  const bits = [r.id, `h=${r.scrollHeight}`];
  if (r.fold) bits.push(`fold=${JSON.stringify(r.fold)}`);
  if (r.timerBar) bits.push(`timer=${JSON.stringify(r.timerBar)}`);
  if (r.rows) bits.push(`rows=${JSON.stringify(r.rows)}`);
  if (r.milkRow) bits.push(`milk=${r.milkRow}`);
  if (r.smallTargets || r.contrastFails.length || r.jsErrors.length) bits.push(`PROBLEMS small=${JSON.stringify(r.smallTargetsList)} contrast=${JSON.stringify(r.contrastFails)} js=${JSON.stringify(r.jsErrors)}`);
  console.log(bits.join(' · '));
}
