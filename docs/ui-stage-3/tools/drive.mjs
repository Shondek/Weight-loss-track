/**
 * שני "נהגים" לאותן פעולות על מסך האימון — הגרסה הישנה (לפני שלב 3) והחדשה.
 * כל בדיקת שוויון מריצה את אותו תסריט דרך שני הנהגים, כך שההבדל היחיד הוא
 * הממשק. כלי עבודה בלבד.
 *
 * מונה נגיעות: כל click נספר; הקלדה בשדה נספרת כ-click (המיקוד) + typed.
 */
import { advance, settle, tab } from './lib.mjs';

class Counter {
  constructor() {
    this.clicks = 0;
    this.typed = 0;
  }
  reset() {
    this.clicks = 0;
    this.typed = 0;
  }
}

async function click(loc, counter) {
  await loc.scrollIntoViewIfNeeded();
  await loc.click();
  if (counter) counter.clicks++;
}

/** הקלדה בשדה מספר: מיקוד (נגיעה), ניקוי, הקלדה. */
async function type(loc, value, counter) {
  await loc.scrollIntoViewIfNeeded();
  await loc.click();
  await loc.fill(String(value));
  await loc.blur();
  if (counter) {
    counter.clicks++;
    counter.typed++;
  }
}

/** בחירת מכשיר, דקות, שיפוע ומהירות באירובי הסיום (אותו CardioFocus בשתי הגרסאות). */
async function fillFinisher(page, { mode, minutes, incline, speed }) {
  await page.getByRole('group', { name: /^מכשיר — אירובי/ }).getByRole('button', { name: mode }).click();
  await settle(page, 150);
  const min = page.getByLabel(/^דקות — אירובי/);
  await min.fill(String(minutes));
  await min.blur();
  const inc = page.getByLabel(/^שיפוע/).first();
  await inc.fill(String(incline));
  await inc.blur();
  const sp = page.getByLabel(/^מהירות/).first();
  await sp.fill(String(speed));
  await sp.blur();
  await settle(page, 150);
}

/** ריצת האירובי: התחל → זמן עובר → סיים → שמור בסיכום. */
async function runFinisher(page, minutesElapsed, scope = page) {
  await scope.getByRole('button', { name: 'התחל', exact: true }).click();
  await settle(page, 200);
  await advance(page, minutesElapsed * 60 * 1000);
  // "סיים" של הריצה (בתוך כרטיס האירובי), לא "סיים" של האימון.
  await scope.locator('.focus').getByRole('button', { name: 'סיים', exact: true }).click();
  await settle(page, 300);
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await settle(page, 300);
}

async function setPain(page, knee, shoulder) {
  // גרסה חדשה: אחרי דירוג מלא הבלוק מכווץ — "שנה" פותח את הסולמות.
  const change = page.locator('.wk-pain').getByRole('button', { name: 'שנה' });
  if ((await change.count()) > 0) {
    await change.click();
    await settle(page, 150);
  }
  if (knee !== null) await page.getByRole('group', { name: 'כאב ברך' }).getByRole('button', { name: String(knee), exact: true }).click();
  if (shoulder !== null) await page.getByRole('group', { name: 'כאב כתף' }).getByRole('button', { name: String(shoulder), exact: true }).click();
  await settle(page, 150);
}

async function exportBackup(page) {
  await tab(page, 'נתונים');
  await settle(page, 400);
  const dl = page.waitForEvent('download');
  const btn = page.getByRole('button', { name: 'הורד קובץ גיבוי' });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  const download = await dl;
  return download.path();
}

// ---------------------------------------------------------------------------
// הגרסה הישנה: עורך מתחת לרשימת השבוע, נקודות ניווט, שדות הקלדה, "השתמש".
// ---------------------------------------------------------------------------
export function oldDriver(page) {
  const c = new Counter();
  const dots = () => page.locator('.focusnav__dot');
  return {
    counter: c,
    async openTab() {
      await tab(page, 'אימונים');
    },
    async start(t) {
      await click(page.locator('.choice--big .choice__btn', { hasText: new RegExp(`^${t}`) }), c);
      await settle(page, 300);
    },
    /** תרגיל כוח מספר n (1..N) לפי סדר הביצוע; 0 = חימום; 'finish' = אירובי הסיום. */
    async goTo(n) {
      if (n === 'finish') await click(dots().last(), c);
      else await click(dots().nth(n), c);
      await settle(page, 250);
    },
    async warmupStart() {
      await click(page.getByRole('button', { name: 'התחל', exact: true }), c);
      await settle(page, 200);
    },
    exerciseName: async () => (await page.locator('.focus__name').first().textContent())?.replace('▶', '').trim(),
    async useSuggestion() {
      // "השתמש" קיים רק כשיש הצעה עם מספר (לא בכיול, לא במשקל גוף, לא בשימור).
      const btn = page.getByRole('button', { name: 'השתמש' });
      if ((await btn.count()) > 0) await click(btn, c);
    },
    async setWeight(w) {
      await type(page.getByLabel(/^משקל — /), w, c);
    },
    /** רישום סט i (1..): בגרסה הישנה הקלדה בשדה החזרות/השניות. */
    async logSet(i, value) {
      const name = await this.exerciseName();
      await type(page.getByLabel(new RegExp(`^(חזרות|שניות), סט ${i} — `)), value, c);
      void name;
      await settle(page, 100);
    },
    async setRir(v) {
      await click(page.locator('.wk-rir .nut-chip', { hasText: new RegExp(`^${v === 4 ? '4\\+' : v}$`) }), c);
    },
    async next() {
      // "הבא"/"דלג" של הניווט בין תרגילים (לא "דלג" של טיימר המנוחה).
      await click(page.locator('.btn.grow', { hasText: /^(הבא|דלג)$/ }).last(), c);
      await settle(page, 250);
    },
    async nextWithoutRir() {
      await this.next();
    },
    async skip() {
      await click(page.getByRole('button', { name: 'דלג ואחזור' }), c);
      await settle(page, 250);
    },
    async swapTo(name) {
      await click(page.getByRole('button', { name: 'החלף', exact: true }), c);
      await settle(page, 150);
      await click(page.locator('.wk-alt', { hasText: name }), c);
      await settle(page, 250);
    },
    async pain(k, s) {
      await setPain(page, k, s);
    },
    async finisher(opts) {
      await this.goTo('finish');
      await fillFinisher(page, opts);
      await runFinisher(page, opts.elapsed);
    },
    async finish() {
      await click(page.locator('.btn--primary.btn--block', { hasText: /^סיים$/ }), c);
      await settle(page, 300);
    },
    async close() {
      await click(page.getByRole('button', { name: 'סגור', exact: true }).first(), c);
      await settle(page, 300);
    },
    async editWorkout(dateDM) {
      const row = page.locator('li', { has: page.locator('.num', { hasText: dateDM }) }).first();
      await click(row.getByRole('button', { name: 'ערוך' }), c);
      await settle(page, 300);
    },
    async export() {
      return exportBackup(page);
    },
    /** מצב ההמשכיות: מה המסך מראה עכשיו. */
    async where() {
      const label = await page.locator('.focusnav .grow').first().textContent();
      return { label: label?.trim(), done: await page.locator('.focusnav__dot.is-done').count() };
    },
  };
}

// ---------------------------------------------------------------------------
// הגרסה החדשה: מסך פתיחה, תצוגת מוקד, steppers ממולאים מראש, "רשום".
// ---------------------------------------------------------------------------
export function newDriver(page) {
  const c = new Counter();
  return {
    counter: c,
    async openTab() {
      await tab(page, 'אימונים');
    },
    async start(t) {
      await click(page.getByRole('button', { name: new RegExp(`^התחל אימון ${t}`) }), c);
      await settle(page, 300);
    },
    async goTo(n) {
      if (n === 0) {
        await click(page.locator('.disc__head', { hasText: 'חימום' }), c);
      } else {
        await click(page.locator('.wk-head__title'), c);
        await settle(page, 150);
        const rows = page.locator('.sheet .listrow');
        if (n === 'finish') await click(rows.last(), c);
        else await click(rows.nth(n - 1), c);
      }
      await settle(page, 250);
    },
    async warmupStart() {
      await click(page.getByRole('button', { name: 'התחל', exact: true }), c);
      await settle(page, 200);
      // סוגרים את שורת החימום חזרה — כמו ביד.
      await click(page.locator('.disc__head', { hasText: 'חימום' }), c);
      await settle(page, 150);
    },
    exerciseName: async () => (await page.locator('.focus__name').first().textContent())?.trim(),
    async useSuggestion() {
      /* ממולא מראש — אין פעולה */
    },
    async setWeight(w) {
      await type(page.getByLabel(/^משקל — /), w, c);
    },
    /** רישום סט i: אם הערך שונה ממה שמוצג — הקלדה/תיקון, ואז "רשום". */
    async logSet(i, value, { adjust = 'type' } = {}) {
      const input = page.getByLabel(new RegExp(`^(חזרות|שניות), סט ${i} — `));
      const shown = await input.inputValue();
      if (value !== undefined && String(value) !== shown) {
        if (adjust === 'type' || shown === '') await type(input, value, c);
        else {
          // תיקון ב-−/+ (נגיעה לכל צעד)
          const delta = value - Number(shown);
          const btn = input.locator('xpath=..').getByRole('button', { name: delta > 0 ? /^הוסף/ : /^הפחת/ });
          for (let k = 0; k < Math.abs(delta); k++) await click(btn, c);
        }
      }
      await click(page.getByRole('button', { name: new RegExp(`^רשום סט ${i}`) }), c);
      await settle(page, 100);
    },
    async setRir(v) {
      await click(page.getByRole('group', { name: 'חזרות ברזרבה בסט האחרון' }).getByRole('button', { name: v === 4 ? '4+' : String(v), exact: true }), c);
    },
    async next() {
      await click(page.getByRole('button', { name: /^(התרגיל הבא|לסיום)$/ }), c);
      await settle(page, 250);
    },
    async nextWithoutRir() {
      await click(page.getByRole('button', { name: 'המשך בלי RIR' }), c);
      await settle(page, 250);
    },
    async skip() {
      await click(page.getByRole('button', { name: 'דלג ואחזור' }), c);
      await settle(page, 250);
    },
    async swapTo(name) {
      await click(page.getByRole('button', { name: 'החלף', exact: true }), c);
      await settle(page, 150);
      await click(page.locator('.sheet .listrow', { hasText: name }), c);
      await settle(page, 250);
    },
    async pain(k, s) {
      await setPain(page, k, s);
    },
    async finisher(opts) {
      await this.goTo('finish');
      await fillFinisher(page, opts);
      await runFinisher(page, opts.elapsed, page.getByRole('region', { name: 'סיום האימון' }));
    },
    async finish() {
      if ((await page.getByRole('button', { name: 'סיים אימון' }).count()) === 0) await this.goTo('finish');
      await click(page.getByRole('button', { name: 'סיים אימון' }), c);
      await settle(page, 300);
    },
    async close() {
      await click(page.getByRole('button', { name: 'סגור', exact: true }).first(), c);
      await settle(page, 300);
    },
    async editWorkout(dateDM) {
      const row = page.locator('li', { has: page.locator('.num', { hasText: dateDM }) }).first();
      await click(row.getByRole('button', { name: 'ערוך' }), c);
      await settle(page, 300);
    },
    async export() {
      return exportBackup(page);
    },
    async where() {
      const label = await page.locator('.wk-head__step').first().textContent();
      return { label: label?.trim(), done: await page.locator('.seg--done').count() };
    },
  };
}

export function driverFor(page, version) {
  return version === 'before' ? oldDriver(page) : newDriver(page);
}
