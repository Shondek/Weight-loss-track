/**
 * משקל שונה לסט — לוגיקת המסך, טהורה. בלי DOM ובלי אחסון.
 *
 * המודל לא השתנה: המשקל תמיד נשמר לכל סט (`LoggedSet.weight`). מה שחדש הוא
 * שמותר לסטים להיות שונים זה מזה בכוונה. "משקל התרגיל" (ה-stepper הראשי)
 * אינו שדה — הוא נגזר מהסטים, כאן. לכן אין שדה חדש, אין מיגרציה, וגיבוי
 * חדש נקרא גם בגרסה ישנה.
 *
 * הכללים:
 *  - רישום רגיל: כל סט מקבל את משקל התרגיל (R2). בלי נגיעה נוספת.
 *  - לסט אפשר לתת משקל משלו. סט כזה לא עוקב אחרי ה-stepper הראשי.
 *  - שינוי ב-stepper הראשי מעדכן רק סטים שעוד לא נרשמו ושאין להם משקל משלהם.
 *    סט שכבר נרשם שומר את המשקל שנרשם בו.
 */

import type { LoggedSet } from '../types';
import { setPerformed } from '../lib/workouts';

/** הערך הנפוץ ברשימה; בשוויון — `prefer` אם הוא בין המובילים, אחרת המאוחר. */
function mode(weights: readonly (number | null)[], prefer: number | null | undefined): number | null {
  const counts = new Map<number | null, { n: number; last: number }>();
  weights.forEach((w, i) => counts.set(w, { n: (counts.get(w)?.n ?? 0) + 1, last: i }));
  let best: number | null = null;
  let bestCount = { n: 0, last: -1 };
  for (const [w, c] of counts) {
    if (c.n > bestCount.n || (c.n === bestCount.n && c.last > bestCount.last)) {
      best = w;
      bestCount = c;
    }
  }
  if (prefer !== undefined && counts.get(prefer)?.n === bestCount.n) return prefer;
  return best;
}

/**
 * משקל התרגיל כפי שנגזר מהסטים השמורים: המשקל של הסטים שעוד לא נרשמו (הם
 * אלה שעוקבים אחרי ה-stepper הראשי); כשכולם נרשמו — המשקל הנפוץ. בשוויון:
 * המשקל של הסט האחרון שנרשם, ואם הוא לא בין המובילים — המאוחר.
 * null כשאין סטים, או כשהמשקל ריק (משקל גוף).
 */
export function exerciseWeight(sets: readonly LoggedSet[]): number | null {
  if (sets.length === 0) return null;
  const performed = sets.filter(setPerformed);
  // סט ריק לגמרי (הושלם לתצוגה אחרי שנשמרו פחות סטים מהמפרט) אינו "משקל" —
  // הוא פשוט עוד לא מולא, ולכן לא משתתף.
  const pending = sets.filter((s) => !setPerformed(s) && s.weight !== null);
  const lastPerformed = performed[performed.length - 1]?.weight;
  const pool = pending.length > 0 ? pending : performed;
  if (pool.length === 0) return null;
  return mode(pool.map((s) => s.weight), lastPerformed);
}

/**
 * הסטים שעוד לא נרשמו ושיש להם משקל משלהם — לפי מה ששמור: משקל ששונה
 * ממשקל התרגיל. (סט שנרשם לא נכלל: הוא ממילא לא עוקב אחרי ה-stepper.)
 */
export function initialOwn(sets: readonly LoggedSet[]): ReadonlySet<number> {
  const main = exerciseWeight(sets);
  const own = new Set<number>();
  sets.forEach((s, i) => {
    // סט ריק (בלי משקל) עוד לא מולא — הוא עוקב אחרי משקל התרגיל, לא "משלו".
    if (!setPerformed(s) && s.weight !== null && s.weight !== main) own.add(i);
  });
  return own;
}

/**
 * שינוי ב-stepper הראשי: רק סטים שעוד לא נרשמו ושאין להם משקל משלהם.
 * סט שנרשם — לא משתנה.
 */
export function applyExerciseWeight(sets: readonly LoggedSet[], own: ReadonlySet<number>, weight: number | null): LoggedSet[] {
  return sets.map((s, i) => (!setPerformed(s) && !own.has(i) ? { ...s, weight } : s));
}

/** משקל לסט אחד בלבד. שאר הסטים לא משתנים. */
export function applySetWeight(sets: readonly LoggedSet[], index: number, weight: number | null): LoggedSet[] {
  return sets.map((s, i) => (i === index ? { ...s, weight } : s));
}

/**
 * רישום סט: הסט מקבל את המשקל שלו (משלו, או של התרגיל) ואת הערך; סטים
 * אחרים שעוד לא נרשמו ואין להם משקל משלהם מתיישרים למשקל התרגיל (כך
 * שהמילוי מראש מההצעה נכתב ב"רשום" הראשון, כמו קודם). סטים שכבר נרשמו
 * שומרים את שלהם.
 */
export function logSetAt(
  sets: readonly LoggedSet[],
  index: number,
  value: { reps: number } | { seconds: number },
  weight: number | null,
  own: ReadonlySet<number>,
  usesWeight: boolean,
): LoggedSet[] {
  return sets.map((s, i) => {
    if (i === index) return { ...s, ...(usesWeight && !own.has(i) ? { weight } : {}), ...value };
    if (usesWeight && !setPerformed(s) && !own.has(i)) return { ...s, weight };
    return s;
  });
}

/** סטים שנרשמו במשקל ששונה ממשקל התרגיל — אלה שמסומנים "משקל אחר". */
export function differingPerformed(sets: readonly LoggedSet[], weight: number | null): number[] {
  const out: number[] = [];
  sets.forEach((s, i) => {
    if (setPerformed(s) && s.weight !== weight) out.push(i);
  });
  return out;
}

/** "החל על הסטים שנרשמו": כל הסטים שנרשמו מקבלים את משקל התרגיל. */
export function applyToPerformed(sets: readonly LoggedSet[], weight: number | null): LoggedSet[] {
  return sets.map((s) => (setPerformed(s) ? { ...s, weight } : s));
}
