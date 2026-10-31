/**
 * צילומים (390×844 @2x) + בדיקות DOM לשלב 5: טוסט מחיקה בכל מסך, טוסט "נשמר",
 * טוסט מעל פס הטיימר באימון, אישור + טוסט במחיקת אימון, פרופיל בת הזוג.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-5/tools/shoot.mjs <dist-dir> <out-dir> <checks-json>
 *
 * אותה זריעה (שישי 30/10/2026 08:05) ואותו שעון כמו בכלי השוויון. לכל צילום
 * נרשמות בדיקות ה-DOM (RTL, גלילה אופקית, אזורי מגע < 44, ניגודיות), ולטוסט
 * — גודל אזור המגע של "בטל" והמיקום ביחס לפס הטיימר ולניווט.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checks, launch, openSeeded, phone, serve, settle, tab } from './lib.mjs';
import { driverFor } from './drive.mjs';

const [, , dist, outDir, checksJson] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const SCENARIO = { today: '2026-10-30', time: '08:05:00' };

/** מדידות הטוסט: אזור המגע של "בטל", ומרחק מהניווט ומפס הטיימר. */
async function toastGeometry(page) {
  return page.evaluate(() => {
    const toast = document.querySelector('.toast:not(.toast--static)');
    if (!toast) return null;
    const r = toast.getBoundingClientRect();
    const btn = toast.querySelector('button');
    const b = btn ? btn.getBoundingClientRect() : null;
    const nav = document.querySelector('nav.tabs')?.getBoundingClientRect() ?? null;
    const timer = document.querySelector('.resttimer')?.getBoundingClientRect() ?? null;
    return {
      toast: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) },
      action: b ? { w: Math.round(b.width), h: Math.round(b.height) } : null,
      navTop: nav ? Math.round(nav.top) : null,
      timerTop: timer ? Math.round(timer.top) : null,
      timerBottom: timer ? Math.round(timer.bottom) : null,
      aboveNav: nav ? r.bottom <= nav.top : null,
      aboveTimer: timer ? r.bottom <= timer.top : null,
      text: toast.innerText.replace(/\s+/g, ' ').trim(),
    };
  });
}

const SCENARIOS = [
  { id: '01-today-delete-weight', title: 'היום: מחיקת שקילה → "נמחק · שקילה · בטל"', act: (d) => d.deleteWeight('27/10/2026') },
  { id: '02-today-delete-steps', title: 'היום: מחיקת צעדים → טוסט', act: (d) => d.deleteSteps('29/10/2026') },
  { id: '03-nutrition-delete-entry', title: 'תזונה: מחיקת רישום → טוסט', act: (d) => d.deleteEntry("קוטג'") },
  { id: '04-workout-delete-cardio', title: 'אימונים: מחיקת אירובי עצמאי (נגיעה אחת) → טוסט', act: (d) => d.deleteStandalone() },
  { id: '05-data-delete-food', title: 'נתונים: מחיקת מזון שלי (אחרי אישור) → טוסט', act: (d) => d.deleteCustomFood('PRO 40') },
  { id: '06-saved-waist', title: 'היום: "עדכן מדידה" → "נשמר"', act: (d) => d.saveWaist() },
  {
    id: '07-checkin-saved',
    title: "צ'ק-אין: נגיעה בסולם → \"נשמר\"",
    act: async (d, page) => {
      await tab(page, "צ'ק-אין");
      const grp = page.getByRole('group', { name: 'היצמדות' });
      await grp.scrollIntoViewIfNeeded();
      await grp.getByRole('button', { name: '7', exact: true }).click();
      await settle(page, 200);
    },
  },
  {
    id: '08-toast-above-timer',
    title: 'טוסט מעל פס הטיימר: סט נרשם באימון (טיימר רץ) → מחיקת שקילה בהיום',
    act: async (d) => {
      await d.startWorkoutAndLogSet();
      await d.deleteWeight('27/10/2026');
    },
  },
  {
    id: '09-workout-confirm',
    title: 'אימונים: מחיקת אימון — נגיעה ראשונה: "אישור מחיקה" (האישור נשאר)',
    act: async (d, page) => {
      await tab(page, 'אימונים');
      const history = page.locator('section', { has: page.getByRole('heading', { name: 'היסטוריה' }) });
      await history.getByRole('button', { name: /^26\/10/ }).first().click();
      await settle(page, 200);
      const btn = history.getByRole('button', { name: /^מחק אימון/ });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await settle(page, 200);
    },
  },
  { id: '10-workout-delete-toast', title: 'אימונים: אחרי האישור — "נמחק · אימון B 26/10 · בטל"', act: (d) => d.deleteWorkout('26/10') },
  {
    id: '11-nutrition-closed-toast',
    title: 'תזונה: "סגור יום" → "היום נסגר · בטל" (אותו טוסט)',
    act: async (d, page) => {
      await tab(page, 'תזונה');
      await page.locator('.nut-top').getByRole('button', { name: 'סגור יום' }).click();
      await settle(page, 250);
    },
  },
  {
    id: '12-partner-delete-workout',
    title: 'בת הזוג: מחיקת אימון → אותו טוסט',
    profile: 'partner',
    act: async (d, page) => {
      await tab(page, 'אימונים');
      const history = page.locator('section', { has: page.getByRole('heading', { name: 'היסטוריה' }) });
      await history.getByRole('button', { name: /^28\/10/ }).first().click();
      await settle(page, 200);
      const btn = history.getByRole('button', { name: /^מחק אימון/ });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await settle(page, 150);
      await btn.click();
      await settle(page, 250);
    },
  },
];

const server = await serve(dist, 4520);
const browser = await launch();
const results = [];
try {
  const ctx = await phone(browser);
  for (const sc of SCENARIOS) {
    const page = await openSeeded(ctx, server.url, { ...SCENARIO, ...(sc.profile ? { profile: sc.profile } : {}) });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    const d = driverFor(page, 'after');
    await sc.act(d, page);
    await settle(page, 300);
    await page.screenshot({ path: path.join(outDir, `${sc.id}.png`) });
    const c = await checks(page);
    const toast = await toastGeometry(page);
    results.push({ id: sc.id, title: sc.title, toast, errors, ...c });
    console.log(sc.id, JSON.stringify({ toast: toast?.text, action: toast?.action, aboveNav: toast?.aboveNav, aboveTimer: toast?.aboveTimer, hscroll: c.hscroll, small: c.smallTargets, contrastMin: c.contrastMin, fails: c.contrastFails.length, errors }));
    await page.close();
  }
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(checksJson, JSON.stringify(results, null, 1));
