/**
 * נהג לפעולות של שלב 6 בשתי הגרסאות — "לפני" (PR #35) ו"אחרי" (צ'ק-אין
 * ונתונים במבנה החדש). אותן פעולות, אותם ערכים; ההבדל היחיד הוא הסלקטורים
 * במקומות שבהם המבנה השתנה (רשימת המזונות, הדבקת JSON, כפתור הסגירה
 * בתחתית התזונה שהוסר). כלי עבודה בלבד.
 */
import { settle, tab } from './lib.mjs';

async function click(loc) {
  await loc.scrollIntoViewIfNeeded();
  await loc.click();
}

async function type(loc, value) {
  await loc.scrollIntoViewIfNeeded();
  await loc.click();
  await loc.fill(String(value));
  await loc.blur().catch(() => undefined);
}

/** ערכי הצ'ק-אין — זהים בשתי הגרסאות. */
export const CHECKIN = {
  adherence: 7,
  hunger: 4,
  energy: 6,
  sleepHours: 7.5,
  unplannedSnackDays: 2,
  homeLunchDays: 3,
  note: 'שבוע טוב. קצת רעב בערב, שינה בסדר.',
};

/** המזון החדש והעריכה — זהים בשתי הגרסאות. */
export const NEW_FOOD = { name: 'חטיף חלבון ביתי', kcal: 350, protein: 30 };
export const EDIT_FOOD = { name: 'טחינה גולמית מלאה', kcal: 600 };
export const NEW_PROTEIN = 180;

async function exportBackup(page) {
  await tab(page, 'נתונים');
  await settle(page, 400);
  const btn = page.getByRole('button', { name: 'הורד קובץ גיבוי' });
  await btn.scrollIntoViewIfNeeded();
  // אירוע ההורדה לא תמיד נתפס בניסיון הראשון (Playwright, שעון מותקן) — ניסיון נוסף.
  for (let attempt = 0; attempt < 3; attempt++) {
    const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await btn.click();
    const download = await dl;
    if (download) return download.path();
    if (process.env.DEBUG) console.log('export: no download event, retrying');
  }
  throw new Error('export: no download event after 3 attempts');
}

/** ממלא את עורך המזון מהתווית (אותו CustomFoodEditor בשתי הגרסאות). */
async function fillEditor(page, { name, kcal, protein }) {
  if (name !== undefined) {
    const nameInput = page.getByLabel('שם', { exact: true });
    if ((await nameInput.inputValue()) !== name) await type(nameInput, name);
  }
  if (kcal !== undefined) await type(page.getByLabel('קלוריות', { exact: true }), kcal);
  if (protein !== undefined) await type(page.getByLabel('חלבון', { exact: true }), protein);
}

export function driverFor(page, version) {
  const before = version === 'before';
  const scale = (label) => page.getByRole('group', { name: label, exact: true });
  return {
    version,
    page,
    async openTab(name) {
      await tab(page, name);
    },

    // ---------- צ'ק-אין ----------
    /** כל השדות, באותם ערכים. סולם = נגיעה בערך; שינה = הקלדה; הערה = הקלדה ויציאה. */
    async fillCheckin(v = CHECKIN) {
      await tab(page, "צ'ק-אין");
      for (const [label, value] of [
        ['היצמדות', v.adherence],
        ['רעב', v.hunger],
        ['אנרגיה', v.energy],
      ]) {
        await click(scale(label).getByRole('button', { name: String(value), exact: true }));
        await settle(page, 120);
      }
      await type(page.getByLabel(/^שינה — ממוצע שעות בלילה/), v.sleepHours);
      await settle(page, 120);
      await click(scale('ימי נשנוש בלתי מתוכנן').getByRole('button', { name: String(v.unplannedSnackDays), exact: true }));
      await settle(page, 120);
      await click(page.getByRole('group', { name: /^צהריים מהבית/ }).getByRole('button', { name: String(v.homeLunchDays), exact: true }));
      await settle(page, 120);
      await type(page.locator('#note'), v.note);
      await settle(page, 250);
    },
    /** מה המסך מציג כערכים נבחרים — לאימות שהמילוי נקלט. */
    async checkinState() {
      return page.evaluate(() => {
        const pressed = (label) => {
          const g = [...document.querySelectorAll('[role=group]')].find((x) => x.getAttribute('aria-label') === label || x.getAttribute('aria-label')?.startsWith(label));
          const b = g?.querySelector('button[aria-pressed="true"]');
          return b ? b.textContent.trim() : null;
        };
        const sleep = [...document.querySelectorAll('input[type=number]')].find((i) => document.querySelector(`label[for="${i.id}"]`)?.textContent.startsWith('שינה'));
        return {
          adherence: pressed('היצמדות'),
          hunger: pressed('רעב'),
          energy: pressed('אנרגיה'),
          sleepHours: sleep ? sleep.value : null,
          unplannedSnackDays: pressed('ימי נשנוש בלתי מתוכנן'),
          homeLunchDays: pressed('צהריים מהבית'),
          note: document.querySelector('#note')?.value ?? null,
          status: document.body.innerText.includes('מולא') && !document.body.innerText.includes('לא מולא') ? 'מולא' : 'לא מולא',
        };
      });
    },
    /** "העתק לצ'אט" (דוח הצ'ק-אין) → הטקסט שהועתק (הלוח מוחלף ב-stub). */
    async copyChatReport() {
      await tab(page, "צ'ק-אין");
      await page.evaluate(() => (window.__copied = null));
      await click(page.getByRole('button', { name: /^העתק לצ'אט/ }));
      await settle(page, 200);
      return page.evaluate(() => window.__copied);
    },
    /** "העתק סיכום שבועי" → הטקסט שהועתק. */
    async copyWeeklySummary() {
      await tab(page, "צ'ק-אין");
      await page.evaluate(() => (window.__copied = null));
      await click(page.getByRole('button', { name: /^העתק סיכום שבועי/ }));
      await settle(page, 200);
      return page.evaluate(() => window.__copied);
    },
    /** "שתף" של הסיכום השבועי (אחרי בלבד) → מה נשלח ל-navigator.share (stub). */
    async shareWeeklySummary() {
      await tab(page, "צ'ק-אין");
      await page.evaluate(() => (window.__shared = null));
      const btn = page.getByRole('button', { name: "שתף — סיכום שבועי לצ'אט" });
      if ((await btn.count()) === 0) return null;
      await click(btn);
      await settle(page, 200);
      return page.evaluate(() => window.__shared);
    },
    /** "שתף" של דוח הצ'ק-אין (אחרי בלבד). */
    async shareChatReport() {
      await tab(page, "צ'ק-אין");
      await page.evaluate(() => (window.__shared = null));
      const btn = page.getByRole('button', { name: "שתף — דוח הצ'ק-אין" });
      if ((await btn.count()) === 0) return null;
      await click(btn);
      await settle(page, 200);
      return page.evaluate(() => window.__shared);
    },

    // ---------- נתונים ----------
    /** "יעד יומי" → חלבון → "עדכן יעד מהיום". */
    async updateProtein(value = NEW_PROTEIN) {
      await tab(page, 'נתונים');
      const disc = page.getByRole('button', { name: /^יעד יומי/ });
      if ((await disc.getAttribute('aria-expanded')) !== 'true') await click(disc);
      await settle(page, 200);
      await type(page.getByLabel(/^חלבון/), value);
      await click(page.getByRole('button', { name: 'עדכן יעד מהיום' }));
      await settle(page, 300);
    },
    /** מזון חדש מהתווית ממסך הנתונים. */
    async addCustomFood(food = NEW_FOOD) {
      await tab(page, 'נתונים');
      const add = page.getByRole('button', { name: 'מזון מהתווית' });
      if (before) {
        const disc = page.getByRole('button', { name: /^מזונות שלי/ });
        if ((await disc.getAttribute('aria-expanded')) !== 'true') await click(disc);
        await settle(page, 150);
      }
      await click(add);
      await settle(page, 250);
      await fillEditor(page, food);
      await click(page.getByRole('button', { name: 'שמור מזון' }));
      await settle(page, 300);
    },
    /** עריכת מזון קיים: לפני — "ערוך <שם>" ברשימה; אחרי — השורה עצמה (אותו aria-label). */
    async editCustomFood(name, patch) {
      await tab(page, 'נתונים');
      const disc = page.getByRole('button', { name: before ? /^מזונות שלי/ : /^הרשימה/ });
      if ((await disc.getAttribute('aria-expanded')) !== 'true') await click(disc);
      await settle(page, 150);
      await click(page.getByRole('button', { name: `ערוך ${name}` }));
      await settle(page, 250);
      await fillEditor(page, patch);
      await click(page.getByRole('button', { name: 'שמור שינויים' }));
      await settle(page, 300);
    },
    /** "טען את ספריית המנות" והמתנה לדוח. */
    async loadLibrary() {
      await tab(page, 'נתונים');
      await click(page.getByRole('button', { name: 'טען את ספריית המנות' }));
      await page.getByText(/^נוספו/).waitFor({ timeout: 15000 });
      await settle(page, 300);
      return (await page.getByText(/^נוספו/).innerText()).replace(/\s+/g, ' ').trim();
    },
    /** ייבוא במיזוג מהדבקה: לפני — התיבה גלויה; אחרי — מאחורי "או הדבק JSON" בקבוצת הגיבוי. */
    async importMerge(jsonText) {
      await tab(page, 'נתונים');
      if (!before) {
        const disc = page.getByRole('button', { name: /^או הדבק JSON/ }).first();
        if ((await disc.getAttribute('aria-expanded')) !== 'true') await click(disc);
        await settle(page, 150);
      }
      const ta = page.locator('#import-text');
      await ta.scrollIntoViewIfNeeded();
      await ta.fill(jsonText);
      await click(page.getByRole('button', { name: 'ייבא מהטקסט' }));
      await page.getByText(/^מוזג:/).waitFor({ timeout: 15000 });
      await settle(page, 300);
      return (await page.getByText(/^מוזג:/).innerText()).replace(/\s+/g, ' ').trim();
    },
    /** אזור מסוכן: פותח את "מחק הכול" עד שלב המילה המוקלדת — בלי להקליד. */
    async openWipeStep2() {
      await tab(page, 'נתונים');
      await click(page.getByRole('button', { name: 'מחק את כל הנתונים' }));
      await settle(page, 150);
      await click(page.getByRole('button', { name: 'הבנתי, המשך' }));
      await settle(page, 200);
    },

    // ---------- תזונה ----------
    /** סגירת היום מהכותרת (קיים בשתי הגרסאות). */
    async closeDayHeader() {
      await tab(page, 'תזונה');
      await click(page.locator('.nut-top').getByRole('button', { name: 'סגור יום' }));
      await settle(page, 250);
    },
    /** סגירת היום מהכפתור הגדול בתחתית — קיים רק לפני. מחזיר false אם אין. */
    async closeDayBottom() {
      await tab(page, 'תזונה');
      const btn = page.getByRole('button', { name: /^סיימתי לרשום/ });
      if ((await btn.count()) === 0) return false;
      await click(btn);
      await settle(page, 250);
      return true;
    },
    /** כמה כפתורי סגירה/פתיחה יש במסך התזונה. */
    async closeButtons() {
      await tab(page, 'תזונה');
      return page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .map((b) => b.textContent.trim())
          .filter((t) => /^(סגור יום|פתח מחדש|סיימתי לרשום)/.test(t)),
      );
    },

    // ---------- כללי ----------
    toast() {
      return page.locator('.toast:not(.toast--static)');
    },
    async toastText() {
      const t = this.toast();
      return (await t.count()) ? (await t.first().innerText()).replace(/\s+/g, ' ').trim() : null;
    },
    async export() {
      return exportBackup(page);
    },
  };
}
