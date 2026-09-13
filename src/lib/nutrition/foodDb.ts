/**
 * מבנה קובץ המזון של משרד הבריאות — `public/nutrition/moh-foods.json`.
 *
 * הקובץ נוצר ע"י `scripts/import_nutrition_db.ts` ונכנס ל-Git. הבנייה לא
 * פונה ל-data.gov.il, והאפליקציה טוענת אותו ב-runtime כ-asset (נכנס
 * ל-precache של ה-service worker יחד עם כל מה שב-`public/`).
 *
 * הטיפוסים כאן הם החוזה בין הסקריפט לאפליקציה. שינוי כאן = הרצת הייבוא מחדש.
 *
 * אין בקובץ שדה חיפוש. הוא מחושב פעם אחת בטעינה מ-`name` ו-`en` דרך
 * `normalizeSearch` שב-search.ts — מקור אמת אחד לכללי הנרמול.
 */

/**
 * קטגוריה נגזרת מהספרה הראשונה של קוד המזון בן 8 הספרות (סכימת USDA שהמאגר
 * מבוסס עליה). זו פרשנות שלנו ולא שדה רשמי במאגר.
 */
export type FoodCategory = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  1: 'חלב ומוצריו',
  2: 'בשר, עוף ודגים',
  3: 'ביצים',
  4: 'קטניות, אגוזים וזרעים',
  5: 'דגנים ומאפים',
  6: 'פירות',
  7: 'ירקות',
  8: 'שמנים ושומנים',
  9: 'ממתקים, משקאות ותבלינים',
};

/** יחידת מידה נוחה: "כף" = 10 גרם. ממוינות לפי סדר ההצגה כבר בייבוא. */
export type MohPortion = {
  /** תיאור היחידה כפי שהוא במאגר ("כף", "פרוסה עבה", "קרטון קטן"). */
  u: string;
  /** משקל היחידה בגרמים, מעוגל ל-2 ספרות. */
  g: number;
};

/**
 * מזון אחד. הערכים ל-100 גרם, בדיוק כפי שהם במאגר — לא מחושבים ולא מתוקנים.
 * `null` = המאגר לא מספק את הערך (לא אפס).
 */
export type MohFood = {
  /** קוד המזון בן 8 הספרות (`smlmitzrach`). המזהה היציב לרישומים. */
  id: string;
  /** השם בעברית, כפי שהוא במאגר אחרי איחוד רווחים. זה מה שמוצג. */
  name: string;
  /** השם באנגלית. null כשאין. */
  en: string | null;
  cat: FoodCategory;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number;
  fiber: number | null;
  portions: MohPortion[];
  /**
   * הערך הקלורי במאגר לא מוסבר ע"י המאקרו ובלי הסבר טבעי — כנראה טעות
   * הזנה. הערך לא תוקן; הממשק מציג סימן. נקבע ברשימה קבועה בסקריפט הייבוא.
   */
  suspect?: true;
};

export type MohFoodFile = {
  source: 'moh';
  dataset: string;
  /** מתי הנתונים נמשכו מ-data.gov.il (ISO 8601, UTC). */
  fetchedAt: string;
  resources: Record<string, string>;
  categories: Record<string, string>;
  count: number;
  foods: MohFood[];
};
