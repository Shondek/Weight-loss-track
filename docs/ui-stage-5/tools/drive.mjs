/**
 * נהג לפעולות המחיקה בשתי הגרסאות — "לפני" (אישור בשני שלבים, PR #34) ו"אחרי"
 * (שלב 5: מחיקה מיידית + "בטל" בטוסט לרשומה בודדת; אימון ומזון שלי שומרים
 * את האישור ומקבלים טוסט). אותן פעולות, אותם סלקטורים; ההבדל היחיד הוא
 * מספר הנגיעות בכפתור "מחק". כלי עבודה בלבד.
 */
import { advance, settle, tab } from './lib.mjs';

async function click(loc) {
  await loc.scrollIntoViewIfNeeded();
  await loc.click();
}

/** "מחק" של ConfirmButton: נגיעה ראשונה מבקשת אישור, שנייה מבצעת. */
async function confirmDelete(loc, twice) {
  await click(loc);
  if (twice) {
    await settle(loc.page(), 150);
    await click(loc);
  }
  await settle(loc.page(), 250);
}

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

export function driverFor(page, version) {
  /** ברשומה בודדת: "לפני" = שני שלבים, "אחרי" = נגיעה אחת. */
  const single = version === 'before';
  return {
    version,
    page,
    async openTab(name) {
      await tab(page, name);
    },

    // ---------- היום ----------
    /** שקילה מ"שקילות אחרונות": פתיחת השורה ואז "מחק". */
    async deleteWeight(dmy) {
      await tab(page, 'היום');
      const section = page.locator('section', { has: page.getByRole('heading', { name: 'שקילות אחרונות' }) });
      await click(section.getByRole('button', { name: new RegExp(dmy.replace(/\//g, '\\/')) }).first());
      await settle(page, 150);
      await confirmDelete(section.getByRole('button', { name: `מחק שקילה של ${dmy}` }), single);
    },
    /** מותניים: בחירת תאריך עם מדידה בטופס, ואז "מחק". */
    async deleteWaist(iso, dmy) {
      await tab(page, 'היום');
      const form = page.getByRole('region', { name: 'מותניים — טופס' });
      await form.scrollIntoViewIfNeeded();
      await form.getByLabel('תאריך').fill(iso);
      await settle(page, 200);
      await confirmDelete(form.getByRole('button', { name: `מחק מדידת מותניים של ${dmy}` }), single);
    },
    /** צעדים של התאריך שבטופס (ברירת המחדל: אתמול). */
    async deleteSteps(dmy) {
      await tab(page, 'היום');
      await confirmDelete(page.getByRole('button', { name: `מחק צעדים של ${dmy}` }), single);
    },
    /** שמירה בלי שינוי ערך — "עדכן" של מותניים (לטוסט "נשמר"). */
    async saveWaist() {
      await tab(page, 'היום');
      const form = page.getByRole('region', { name: 'מותניים — טופס' });
      await click(form.getByRole('button', { name: /^(עדכן|שמור) מדידה$/ }));
      await settle(page, 200);
    },

    // ---------- תזונה ----------
    /** רישום מזון של היום: השורה פותחת את החלונית, "מחק" בה (אותו דבר בשתי הגרסאות). */
    async deleteEntry(name) {
      await tab(page, 'תזונה');
      const row = page.getByRole('region', { name: /^מה אכלתי/ }).locator('.listrow', { hasText: name }).first();
      await click(row);
      await settle(page, 200);
      await click(page.locator('.sheet').getByRole('button', { name: 'מחק' }));
      await settle(page, 250);
    },
    /** שמות הרישומים של היום כפי שמוצגים — להשוואת התצוגה לפני/אחרי מחיקת מזון שלי. */
    async todayEntriesText() {
      await tab(page, 'תזונה');
      const region = page.getByRole('region', { name: /^מה אכלתי/ });
      return region.locator('.listrow').allInnerTexts();
    },

    // ---------- אימונים ----------
    /** אירובי עצמאי של השבוע: "ערוך" → סיכום → "מחק". */
    async deleteStandalone() {
      await tab(page, 'אימונים');
      const row = page.locator('li', { hasText: 'אירובי' }).filter({ has: page.getByRole('button', { name: 'ערוך' }) }).first();
      await click(row.getByRole('button', { name: 'ערוך' }));
      await settle(page, 250);
      await confirmDelete(page.getByRole('button', { name: /^מחק — אירובי/ }), single);
    },
    /** אימון מההיסטוריה: פתיחת השורה ואז "מחק" + אישור (בשתי הגרסאות). */
    async deleteWorkout(dm) {
      await tab(page, 'אימונים');
      const history = page.locator('section', { has: page.getByRole('heading', { name: 'היסטוריה' }) });
      await click(history.getByRole('button', { name: new RegExp(`^${dm.replace(/\//g, '\\/')}`) }).first());
      await settle(page, 200);
      await confirmDelete(history.getByRole('button', { name: /^מחק אימון/ }), true);
    },
    /** מתחיל את האימון הבא ורושם סט ראשון — פס הטיימר עולה. */
    async startWorkoutAndLogSet() {
      await tab(page, 'אימונים');
      await click(page.getByRole('button', { name: /^התחל אימון/ }).first());
      await settle(page, 300);
      await click(page.getByRole('button', { name: /^רשום סט/ }).first());
      await settle(page, 300);
    },

    // ---------- נתונים ----------
    /** מזון שלי: "מזונות שלי" → "ערוך <שם>" → "מחק מזון" + אישור (בשתי הגרסאות). */
    async deleteCustomFood(name) {
      await tab(page, 'נתונים');
      const disclosure = page.getByRole('button', { name: /^מזונות שלי/ });
      if ((await disclosure.getAttribute('aria-expanded')) !== 'true') await click(disclosure);
      await settle(page, 150);
      await click(page.getByRole('button', { name: `ערוך ${name}` }));
      await settle(page, 250);
      // הכפתור בלי aria-label: הכיתוב משתנה ל"אישור מחיקה — …" אחרי הנגיעה הראשונה.
      await confirmDelete(page.getByRole('button', { name: /^(מחק מזון|אישור מחיקה)/ }), true);
    },

    // ---------- טוסט ----------
    toast() {
      return page.locator('.toast:not(.toast--static)');
    },
    async toastText() {
      const t = this.toast();
      return (await t.count()) ? (await t.first().innerText()).replace(/\s+/g, ' ').trim() : null;
    },
    /** "בטל" בטוסט. */
    async undo() {
      await click(this.toast().getByRole('button', { name: /בטל/ }));
      await settle(page, 250);
    },
    /** מקדם את השעון עד שהטוסט נעלם (6 שניות + מרווח). */
    async letToastExpire() {
      await advance(page, 6500);
    },
    async export() {
      return exportBackup(page);
    },
  };
}
