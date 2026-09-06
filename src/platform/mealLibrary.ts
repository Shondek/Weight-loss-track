/**
 * טעינת קובץ ספריית המנות מהאתר עצמו. נוגע ברשת — לכן ב-platform.
 *
 * הקובץ יושב ב-public/library/ ונכנס ל-precache של ה-service worker כמו
 * קובץ המזון, ולכן זמין גם אופליין. התוכן מאומת ב-parseDb במסך הנתונים
 * ומוטמע במיזוג (lib/nutrition/library.ts). לא נשמר בזיכרון: הכפתור
 * נלחץ לעיתים רחוקות, וכל לחיצה צריכה את הגרסה הנוכחית.
 */

const URL_PATH = `${import.meta.env.BASE_URL}library/meal-library-v2.json`;

export async function loadMealLibrary(): Promise<unknown> {
  const res = await fetch(URL_PATH, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`ספריית המנות לא נטענה (${res.status})`);
  return (await res.json()) as unknown;
}
