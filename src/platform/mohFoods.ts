/**
 * טעינת קובץ המזון של משרד הבריאות. נוגע ברשת — לכן ב-platform ולא ב-lib.
 *
 * הקובץ יושב ב-public/nutrition/ ונכנס ל-precache של ה-service worker, כך
 * שאחרי הפתיחה הראשונה הוא זמין אופליין. נטען פעם אחת לחיי הדף; כל
 * קריאה נוספת מקבלת את אותה הבטחה.
 */

import type { MohFood, MohFoodFile } from '../lib/nutrition/foodDb';

const URL_PATH = `${import.meta.env.BASE_URL}nutrition/moh-foods.json`;

let pending: Promise<MohFoodFile> | null = null;

function isFile(v: unknown): v is MohFoodFile {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { source?: unknown }).source === 'moh' &&
    Array.isArray((v as { foods?: unknown }).foods)
  );
}

export function loadMohFoods(): Promise<MohFoodFile> {
  if (!pending) {
    pending = (async () => {
      const res = await fetch(URL_PATH);
      if (!res.ok) throw new Error(`קובץ המזון לא נטען (${res.status})`);
      const body: unknown = await res.json();
      if (!isFile(body)) throw new Error('קובץ המזון אינו במבנה הצפוי');
      // הקובץ הוא asset שלנו — לא מנרמלים כל שדה, רק מסננים שורה שבורה.
      const foods = body.foods.filter(
        (f): f is MohFood => typeof f?.id === 'string' && typeof f.name === 'string' && typeof f.kcal === 'number',
      );
      return { ...body, foods };
    })().catch((err: unknown) => {
      pending = null; // כישלון לא נשמר — הניסיון הבא יטען שוב.
      throw err;
    });
  }
  return pending;
}
