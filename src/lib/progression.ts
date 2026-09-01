/**
 * המלצת ההתקדמות. מודול טהור — בלי React, בלי אחסון, בלי גישה לתוכנית.
 *
 * ההמלצה **לעולם לא נשמרת**. היא מחושבת מחדש בכל רינדור מהנתונים הגולמיים
 * של התרגיל. כך שינוי עתידי בלוגיקה מעדכן גם את כל ההיסטוריה, במקום להשאיר
 * אותה עם המלצות ישנות שכבר לא נכונות.
 *
 * כל מה שהפונקציה צריכה מוקפא בתוך `LoggedExercise` בזמן השמירה — היעד,
 * סוג התנועה, והאם מותר להוסיף משקל. היא לא מסתכלת על התוכנית הנוכחית.
 */

import type { LoggedExercise, LoggedSet } from '../types';
import { TYPE_CONFIG } from '../data/program';

export type SuggestionKind = 'add-weight' | 'add-reps' | 'hold' | 'deload' | 'none';

export type ProgressionSuggestion = {
  kind: SuggestionKind;
  text: string;
};

const NONE: ProgressionSuggestion = { kind: 'none', text: '' };

/** החזרות או השניות של הסט. סט שלא בוצע מחזיר null. */
function value(s: LoggedSet): number | null {
  return s.reps ?? s.seconds;
}

/** רק סטים שבוצעו נכנסים לחישוב. סט ריק אינו "כישלון". */
function performedValues(ex: LoggedExercise): number[] {
  const out: number[] = [];
  for (const s of ex.sets) {
    const v = value(s);
    if (v !== null) out.push(v);
  }
  return out;
}

/** האם התרגיל נכשל מתחת ליעד המינימלי. */
function belowMinimum(ex: LoggedExercise): boolean {
  const values = performedValues(ex);
  if (values.length === 0) return false;
  return values.some((v) => v < ex.targetRepMin);
}

/**
 * ההמלצה לתרגיל.
 *
 * סדר הבדיקות מכוון: **"מתחת למינימום" ראשון.** תרגיל שנכשל בסט אחד
 * ועבר את התקרה באחר אינו התקדמות — הוא סימן שהמשקל כבד מדי.
 *
 * @param previous הרישום הקודם של אותו תרגיל, לזיהוי כישלון שני ברצף.
 */
export function getProgressionSuggestion(
  current: LoggedExercise,
  previous?: LoggedExercise | null,
): ProgressionSuggestion {
  const values = performedValues(current);
  if (values.length === 0) return NONE;

  const timed = current.sets.some((s) => s.seconds !== null);
  const unit = timed ? 'שניות' : 'חזרות';

  // 1. נפילה מתחת ליעד — לא יורדים במשקל, מלבד פעם שנייה ברצף.
  if (belowMinimum(current)) {
    if (previous && belowMinimum(previous)) {
      return {
        kind: 'deload',
        text: 'פעם שנייה ברצף — רד מדרגה אחת ובנה מחדש.',
      };
    }
    return { kind: 'hold', text: 'אותו משקל בפעם הבאה. לא יורדים.' };
  }

  // 2. כל הסטים בתקרה — עולים.
  if (values.every((v) => v >= current.targetRepMax)) {
    const increment = TYPE_CONFIG[current.type].weightIncrement;
    if (current.bodyweightOnly || increment === 0) {
      return {
        kind: 'add-reps',
        text: timed
          ? 'טווח הושלם — הארך את הזמן או האט את הקצב.'
          : 'טווח הושלם — הוסף חזרות או האט את הקצב.',
      };
    }
    return {
      kind: 'add-weight',
      text: `הוסף ${increment} ק״ג, חזור ל-${current.targetRepMin} ${unit}`,
    };
  }

  // 3. בתוך הטווח — מוסיפים חזרות.
  return { kind: 'add-reps', text: `+1–2 ${unit} בכל סט בפעם הבאה` };
}

/**
 * המשקל המוצע לפעם הבאה: המשקל האחרון, ועוד התוספת אם ההמלצה היא לעלות.
 * מחזיר null כשאין משקל להתבסס עליו.
 */
export function suggestedNextWeight(
  ex: LoggedExercise,
  previous?: LoggedExercise | null,
): number | null {
  let last: number | null = null;
  for (let i = ex.sets.length - 1; i >= 0; i--) {
    const w = ex.sets[i]?.weight;
    if (w !== null && w !== undefined) {
      last = w;
      break;
    }
  }
  if (last === null) return null;
  const suggestion = getProgressionSuggestion(ex, previous);
  if (suggestion.kind !== 'add-weight') return last;
  return last + TYPE_CONFIG[ex.type].weightIncrement;
}
