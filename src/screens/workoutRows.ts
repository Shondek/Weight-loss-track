/**
 * שורות האימון כפי שהעורך מציג אותן — שכבת מסך מעל `exercisesFor`
 * (src/lib/workouts.ts, ללא שינוי). מודול טהור.
 *
 * `exercisesFor` משלים לכל רשומה את התאים של התוכנית *הנוכחית*. לאימון חדש
 * זה נכון. לאימון ישן, אחרי שהתוכנית השתנתה, זה יצר שלוש תקלות תצוגה
 * (ממצא 4, מ-PR #20, #21, #37):
 *
 *  1. **תא חדש שמופיע באימון ישן.** אימון B מלפני 4/11 קיבל שורה ריקה של
 *     "הרחקה אופקית בפולי" (תא שנוסף אחריו). כל עריכה שמרה את השורה הריקה
 *     ברשומה, ומשם היא הופיעה ב"דולגו" — ברשימה, בסיכום ובדוח.
 *  2. **שורה כפולה לתרגיל שהוחלף.** שורה עם `swappedFrom` תופסת את התא של
 *     התרגיל המקורי; כשהחלופה עצמה נהייתה תא בתוכנית, נוספה לה שורה ריקה
 *     שנייה באותו מזהה. עריכה כתבה את אותם נתונים לשתיהן.
 *  3. **שורה ריקה לצד החלופה** — אותו מקרה, כשהתא המקורי ירד מהתוכנית.
 *
 * הכלל כאן: **מה שהיה מתוכנן באותו יום מוקפא ברשומה.** לרשומה שיש בה
 * תרגילי כוח מציגים רק את השורות שנשמרו בה (ושורה אחת לכל מזהה). רק
 * לרשומה בלי אף תרגיל כוח (רשומה ישנה מאוד, או טיוטה) משלימים מהתוכנית.
 * אימון חדש נוצר עם כל תאי התוכנית, ולכן שום דבר לא משתנה בו.
 *
 * מכיוון שהעורך שומר את השורות שהוא מציג, התאים החדשים והכפילויות גם לא
 * נכתבים יותר לרשומה. רשומה שכבר נשמרה איתם בעבר לא משתנה מעצמה.
 */

import type { LoggedExercise, WorkoutEntry } from '../types';
import { exercisesFor, hasData, isCardio } from '../lib/workouts';

/**
 * שורה אחת לכל מזהה תרגיל. כשיש שתיים — זו שיש בה נתונים, ואם בשתיהן (או
 * באף אחת) — הראשונה. הסדר של השורות שנשארות לא משתנה. חימום ואירובי לא נוגעים.
 */
export function uniqueRows(rows: readonly LoggedExercise[]): LoggedExercise[] {
  const winner = new Map<string, LoggedExercise>();
  for (const row of rows) {
    if (isCardio(row)) continue;
    const current = winner.get(row.exerciseId);
    if (!current || (!hasData(current) && hasData(row))) winner.set(row.exerciseId, row);
  }
  return rows.filter((row) => isCardio(row) || winner.get(row.exerciseId) === row);
}

/** השורות לעורך: חימום, תרגילי הכוח של הרשומה, אירובי סיום. */
export function editorRows(entry: WorkoutEntry, all: readonly WorkoutEntry[]): LoggedExercise[] {
  const base = exercisesFor(entry, all);
  const saved = new Set(entry.ex.filter((e) => !isCardio(e)).map((e) => e.exerciseId));
  // רשומה בלי אף תרגיל כוח: אין "מה שתוכנן" להקפיא — התוכנית הנוכחית, כמו קודם.
  if (saved.size === 0) return uniqueRows(base);
  return uniqueRows(base.filter((row) => isCardio(row) || saved.has(row.exerciseId)));
}
