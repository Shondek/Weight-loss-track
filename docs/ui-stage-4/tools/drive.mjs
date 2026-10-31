/**
 * שני "נהגים" לאותן פעולות על מסך התזונה — הגרסה הישנה (לפני שלב 4) והחדשה.
 * כל בדיקת שוויון מריצה את אותו תסריט דרך שני הנהגים, כך שההבדל היחיד הוא
 * הממשק. כלי עבודה בלבד.
 *
 * מונה נגיעות: כל click נספר; הקלדה בשדה נספרת כ-click (המיקוד) + typed.
 * פעולה שאין לה ממשק בגרסה הישנה (מועדפים) מחזירה false ולא נוגעת בכלום.
 */
import { settle, tab } from './lib.mjs';

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

/** הקלדה בשדה: מיקוד (נגיעה), ניקוי, הקלדה. */
async function type(loc, value, counter) {
  await loc.scrollIntoViewIfNeeded();
  await loc.click();
  await loc.fill(String(value));
  // בגרסה הישנה שדה הגרמים נכתב חי, והבקרה עלולה להתחלף ליחידה אחרת
  // (300 ג׳ = כף ×7½) לפני ה-blur — השדה נעלם, והערך כבר נשמר.
  await loc.blur().catch(() => undefined);
  if (counter) {
    counter.clicks++;
    counter.typed++;
  }
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

/** ממלא את עורך המזון מהתווית (אותו CustomFoodEditor בשתי הגרסאות) ושומר. */
async function fillEditor(page, { name, kcal, protein }, c) {
  const nameInput = page.getByLabel('שם', { exact: true });
  if ((await nameInput.inputValue()) !== name) await type(nameInput, name, c);
  await type(page.getByLabel('קלוריות', { exact: true }), kcal, c);
  await type(page.getByLabel('חלבון', { exact: true }), protein, c);
  await click(page.getByRole('button', { name: 'שמור מזון' }), c);
  await settle(page, 300);
}

/** "ארוחה בחוץ": אותם שדות (#out-*) בשתי הגרסאות. */
async function fillOut(page, { name, kcal, protein }, c) {
  await type(page.locator('#out-name'), name, c);
  await type(page.locator('#out-kcal'), kcal, c);
  await type(page.locator('#out-protein'), protein, c);
  await click(page.getByRole('button', { name: 'רשום', exact: true }), c);
  await settle(page, 300);
}

// ---------------------------------------------------------------------------
// הגרסה הישנה: בקרת כמות בכל שורה, בחירה מחיפוש עם "הוסף", עריכה בשורה.
// ---------------------------------------------------------------------------
export function oldDriver(page) {
  const c = new Counter();
  /** שורת "מה שאני אוכל" לפי שם. */
  const quick = (name) => page.locator('.nut-quick__item', { hasText: name }).first();
  /** בקרת כמות בתוך הקשר: +/−, מעבר, הקלדה. */
  const qtyIn = (scope, label) => ({
    async plus(n = 1) {
      for (let i = 0; i < n; i++) await click(scope.getByRole('button', { name: 'יותר' }), c);
    },
    async minus(n = 1) {
      for (let i = 0; i < n; i++) await click(scope.getByRole('button', { name: 'פחות' }), c);
    },
    async toGrams() {
      await click(scope.getByRole('button', { name: 'מעבר לגרמים' }), c);
    },
    async typeGrams(g) {
      // השדה יחיד בתוך ההקשר (שורה / בחירה / עריכה); השם המלא יכול להכיל תווי regex.
      void label;
      await type(scope.getByLabel(/^גרמים — /), g, c);
    },
  });
  return {
    counter: c,
    version: 'before',
    async openTab() {
      await tab(page, 'תזונה');
    },
    /** פריט מ"מה שאני אוכל": `adjust(qty)` מכוון כמות, ואז נגיעה = רישום. */
    async logFrequent(name, adjust) {
      const row = quick(name);
      await row.scrollIntoViewIfNeeded();
      if (adjust) await adjust(qtyIn(row, name));
      await click(row.locator('.nut-quick__tap'), c);
      await settle(page, 200);
    },
    /** אין מועדפים בגרסה הישנה: אותו מזון נרשם מ"מה שאני אוכל". */
    async logFavorite(name, adjust) {
      return this.logFrequent(name, adjust);
    },
    async search(query) {
      await type(page.locator('#food-search'), query, c);
      await settle(page, 200);
    },
    async pickResult(name, adjust) {
      await click(page.locator('.results__btn', { hasText: name }).first(), c);
      await settle(page, 200);
      const sel = page.locator('.nut-selected');
      if (adjust) await adjust(qtyIn(sel, name));
      await click(sel.getByRole('button', { name: 'הוסף', exact: true }), c);
      await settle(page, 200);
    },
    /** עריכת רישום של היום: פותח את השורה, מכוון כמות/ארוחה, סוגר. */
    async editEntry(name, { adjust, meal } = {}) {
      const row = page.locator('.nut-row', { hasText: name }).first();
      await click(row.locator('.nut-row__tap'), c);
      await settle(page, 150);
      const edit = row.locator('.nut-row__edit');
      if (adjust) await adjust(qtyIn(edit, name));
      if (meal) await click(edit.locator('.nut-chip', { hasText: meal }), c);
      await click(row.locator('.nut-row__tap'), c); // סגירה
      await settle(page, 150);
    },
    async deleteEntry(name) {
      const row = page.locator('.nut-row', { hasText: name }).first();
      await click(row.locator('.nut-row__tap'), c);
      await settle(page, 150);
      await click(row.getByRole('button', { name: /^מחק/ }), c);
      await settle(page, 200);
    },
    /** מועדפים: אין ממשק בגרסה הישנה. */
    async markFavorite() {
      return false;
    },
    async unmarkFavorite() {
      return false;
    },
    /** מזון חדש מהתווית: דרך מסך "נתונים" → "מזונות שלי"; ואז רישום מחיפוש. */
    async newCustomFood(food, grams) {
      await tab(page, 'נתונים');
      await click(page.getByRole('button', { name: /^מזונות שלי/ }), c);
      await click(page.getByRole('button', { name: 'מזון מהתווית' }), c);
      await settle(page, 200);
      await fillEditor(page, food, c);
      await tab(page, 'תזונה');
      await this.search(food.name);
      await this.pickResult(food.name, async (q) => {
        if (grams !== undefined) await q.typeGrams(grams);
      });
    },
    async out(values) {
      await click(page.getByRole('button', { name: /^ארוחה בחוץ/ }), c);
      await settle(page, 150);
      await fillOut(page, values, c);
    },
    async creatine() {
      await click(page.locator('.nut-creatine__tap'), c);
      await settle(page, 150);
    },
    async friday(tierLabel) {
      await click(page.locator('.nut-chip--tier', { hasText: tierLabel }), c);
      await settle(page, 200);
    },
    async closeDay() {
      await click(page.getByRole('button', { name: /^סיימתי לרשום/ }), c);
      await settle(page, 200);
    },
    async export() {
      return exportBackup(page);
    },
  };
}

// ---------------------------------------------------------------------------
// הגרסה החדשה: חלונית כמות אחת (QtySheet) לכל בחירה; מועדפים כאריחים.
// ---------------------------------------------------------------------------
export function newDriver(page) {
  const c = new Counter();
  const sheet = () => page.locator('.sheet');
  /** פעולות בתוך החלונית. */
  const qtyIn = () => ({
    async plus(n = 1) {
      for (let i = 0; i < n; i++) await click(sheet().getByRole('button', { name: /^יותר/ }), c);
    },
    async minus(n = 1) {
      for (let i = 0; i < n; i++) await click(sheet().getByRole('button', { name: /^פחות/ }), c);
    },
    async toGrams() {
      await click(sheet().getByRole('group', { name: 'יחידת הכמות' }).getByRole('button', { name: 'גרמים' }), c);
    },
    async typeGrams(g) {
      await type(sheet().locator('.qty__input'), g, c);
    },
    async preset(label) {
      await click(sheet().getByRole('group', { name: 'כמויות נפוצות' }).getByRole('button', { name: label }), c);
    },
  });
  const addFromSheet = async () => {
    await click(sheet().getByRole('button', { name: 'הוסף לרישום' }), c);
    await settle(page, 200);
  };
  const frequentRow = (name) => page.getByRole('region', { name: 'מה שאני אוכל' }).locator('.listrow', { hasText: name }).first();
  return {
    counter: c,
    version: 'after',
    async openTab() {
      await tab(page, 'תזונה');
    },
    async logFrequent(name, adjust) {
      await click(frequentRow(name), c);
      await settle(page, 200);
      if (adjust) await adjust(qtyIn());
      await addFromSheet();
    },
    async logFavorite(name, adjust) {
      await click(page.locator('.qtile', { hasText: name }).first(), c);
      await settle(page, 200);
      if (adjust) await adjust(qtyIn());
      await addFromSheet();
    },
    async search(query) {
      await type(page.locator('#food-search'), query, c);
      await settle(page, 200);
    },
    async pickResult(name, adjust) {
      await click(page.locator('.nut-results .listrow', { hasText: name }).first(), c);
      await settle(page, 200);
      if (adjust) await adjust(qtyIn());
      await addFromSheet();
    },
    async editEntry(name, { adjust, meal } = {}) {
      const row = page.getByRole('region', { name: /^מה אכלתי/ }).locator('.listrow', { hasText: name }).first();
      await click(row, c);
      await settle(page, 150);
      if (adjust) await adjust(qtyIn());
      if (meal) await click(sheet().getByRole('group', { name: 'ארוחה' }).getByRole('button', { name: meal }), c);
      await click(sheet().getByRole('button', { name: 'שמור', exact: true }), c);
      await settle(page, 150);
    },
    async deleteEntry(name) {
      const row = page.getByRole('region', { name: /^מה אכלתי/ }).locator('.listrow', { hasText: name }).first();
      await click(row, c);
      await settle(page, 150);
      await click(sheet().getByRole('button', { name: 'מחק' }), c);
      await settle(page, 200);
    },
    /** כוכב בחלונית של פריט מ"מה שאני אוכל". */
    async markFavorite(name) {
      await click(frequentRow(name), c);
      await settle(page, 150);
      await click(sheet().getByRole('button', { name: 'הוסף למועדפים' }), c);
      await click(sheet().getByRole('button', { name: 'סגור' }), c);
      await settle(page, 150);
      return true;
    },
    /** הסרה מתוך האריח במועדפים. */
    async unmarkFavorite(name) {
      await click(page.locator('.qtile', { hasText: name }).first(), c);
      await settle(page, 150);
      await click(sheet().getByRole('button', { name: /הסר$/ }), c);
      await click(sheet().getByRole('button', { name: 'סגור' }), c);
      await settle(page, 150);
      return true;
    },
    /** מזון חדש מהתווית מתוך "לא נמצא" בחיפוש; החלונית נפתחת מיד אחרי השמירה. */
    async newCustomFood(food, grams) {
      await this.search(food.name);
      await click(page.getByRole('button', { name: 'הוסף מזון מהתווית' }), c);
      await settle(page, 200);
      await fillEditor(page, food, c);
      if (grams !== undefined) await qtyIn().typeGrams(grams);
      await addFromSheet();
    },
    async out(values) {
      await click(page.getByRole('button', { name: 'בחוץ' }), c);
      await settle(page, 150);
      await fillOut(page, values, c);
    },
    async creatine() {
      await click(page.locator('.nut-creatine .listrow'), c);
      await settle(page, 150);
    },
    async friday(tierLabel) {
      await click(page.locator('.nut-chip--tier', { hasText: tierLabel }), c);
      await settle(page, 200);
    },
    async closeDay() {
      await click(page.locator('.nut-top').getByRole('button', { name: 'סגור יום' }), c);
      await settle(page, 200);
    },
    async export() {
      return exportBackup(page);
    },
  };
}

export function driverFor(page, version) {
  return version === 'before' ? oldDriver(page) : newDriver(page);
}
