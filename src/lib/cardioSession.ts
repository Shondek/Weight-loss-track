/**
 * ריצת אירובי בזמן אמת — חותמות זמן, לא מונה. מודול טהור.
 *
 * "התחל" שומר חותמת והערכים ההתחלתיים; כל שינוי שיפוע/מהירות נרשם עם
 * חותמת משלו. המקטעים נגזרים מההפרשים בין החותמות. שום דבר לא סופר
 * בזמן ריצה, ולכן נעילת מסך, מעבר לאפליקציה אחרת או הפעלה מחדש של
 * הדפדפן לא משנים את התוצאה — `Date.now()` בסוף הוא כל מה שצריך.
 *
 * הריצה נחתכת בזמן שתוכנן: `endOf` לעולם לא חורג מהדדליין, גם אם
 * "סיים" נלחץ שעתיים אחרי.
 */

import type { CardioMode, CardioSegment, ISODate, WorkoutType } from '../types';

export type CardioSessionTarget =
  | { kind: 'finisher'; workoutId: string; t: WorkoutType; d: ISODate }
  | { kind: 'standalone'; id: string; d: ISODate; note: string };

export type CardioSessionEvent = {
  /** epoch ms */
  at: number;
  incline: number | null;
  speed: number | null;
};

export type CardioSession = {
  target: CardioSessionTarget;
  mode: CardioMode;
  plannedMinutes: number;
  /** epoch ms. `events[0].at === startedAt` תמיד. */
  startedAt: number;
  events: CardioSessionEvent[];
};

const MS_PER_MIN = 60_000;

export function startSession(
  target: CardioSessionTarget,
  mode: CardioMode,
  plannedMinutes: number,
  incline: number | null,
  speed: number | null,
  now: number,
): CardioSession {
  return {
    target,
    mode,
    plannedMinutes: Math.max(1, Math.round(plannedMinutes)),
    startedAt: now,
    events: [{ at: now, incline, speed }],
  };
}

/** הערכים הנוכחיים — של האירוע האחרון. */
export function currentValues(s: CardioSession): { incline: number | null; speed: number | null } {
  const last = s.events[s.events.length - 1] ?? { incline: null, speed: null };
  return { incline: last.incline, speed: last.speed };
}

/**
 * שינוי תוך כדי ריצה. שינוי לאותם ערכים לא נרשם (Stepper שמחזיר את מה
 * שכבר יש). שינוי אחרי הדדליין לא נרשם — הריצה כבר נחתכה.
 */
export function recordChange(
  s: CardioSession,
  patch: Partial<{ incline: number | null; speed: number | null }>,
  now: number,
): CardioSession {
  const cur = currentValues(s);
  const next = { incline: patch.incline ?? cur.incline, speed: patch.speed ?? cur.speed };
  if ('incline' in patch && patch.incline === undefined) next.incline = cur.incline;
  if ('speed' in patch && patch.speed === undefined) next.speed = cur.speed;
  if (next.incline === cur.incline && next.speed === cur.speed) return s;
  if (now >= deadlineOf(s)) return s;
  return { ...s, events: [...s.events, { at: Math.max(now, s.startedAt), ...next }] };
}

export function deadlineOf(s: CardioSession): number {
  return s.startedAt + s.plannedMinutes * MS_PER_MIN;
}

/** סוף הריצה: עכשיו, או הדדליין אם עבר. כאן החיתוך האוטומטי. */
export function endOf(s: CardioSession, now: number): number {
  return Math.min(Math.max(now, s.startedAt), deadlineOf(s));
}

export function isExpired(s: CardioSession, now: number): boolean {
  return now >= deadlineOf(s);
}

/**
 * מקטעים מההפרשים בין חותמות. דקות שלמות, עם העברת שארית: גבול כל מקטע
 * הוא העיגול של הזמן המצטבר, ולכן הסכום שווה תמיד לעיגול של סך הריצה.
 * מקטע שיוצא 0 דק׳ (שינוי מהיר) נשמט — הערכים שלו נבלעים בבא אחריו.
 */
export function deriveSegments(s: CardioSession, end: number): CardioSegment[] {
  const stop = Math.min(end, deadlineOf(s));
  const events = [...s.events].sort((a, b) => a.at - b.at);
  const out: CardioSegment[] = [];
  let prevBoundary = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const next = events[i + 1];
    const segEnd = next ? Math.min(next.at, stop) : stop;
    const cumulative = Math.max(0, segEnd - s.startedAt);
    const boundary = Math.round(cumulative / MS_PER_MIN);
    const minutes = boundary - prevBoundary;
    prevBoundary = boundary;
    if (minutes <= 0) continue;
    out.push({ minutes, incline: ev.incline, speed: ev.speed });
  }
  return out;
}

// ---------- מקטעים — משותף לרשומות שמורות ----------

export function totalMinutes(segments: readonly CardioSegment[]): number {
  return segments.reduce((sum, x) => sum + x.minutes, 0);
}

/** המקטע הארוך ביותר; בשוויון — הראשון. null לרשימה ריקה. */
export function dominantSegment(segments: readonly CardioSegment[]): CardioSegment | null {
  let best: CardioSegment | null = null;
  for (const seg of segments) if (!best || seg.minutes > best.minutes) best = seg;
  return best;
}

/**
 * המקטעים של רשומה: `segments` אם יש, אחרת מקטע יחיד מ-minutes/incline/speed.
 * זה מה שמאפשר לרשומות ישנות להיקרא בלי מיגרציה.
 */
export function segmentsOf(r: {
  minutes: number;
  incline?: number | null | undefined;
  speed?: number | null | undefined;
  segments?: readonly CardioSegment[] | undefined;
}): CardioSegment[] {
  if (r.segments && r.segments.length > 0) return r.segments.map((x) => ({ ...x }));
  return [{ minutes: r.minutes, incline: r.incline ?? null, speed: r.speed ?? null }];
}

/** "5 דק׳ 0% 3.5 קמ״ש / 13 דק׳ 10% 3.5 קמ״ש" — פירוט מקטעים. */
export function segmentsText(segments: readonly CardioSegment[]): string {
  return segments
    .map((x) => {
      const parts = [`${x.minutes} דק׳`];
      if (x.incline !== null) parts.push(`${x.incline}%`);
      if (x.speed !== null) parts.push(`${x.speed} קמ״ש`);
      return parts.join(' ');
    })
    .join(' / ');
}

/** "3,200 צעדים" */
export function stepsText(steps: number): string {
  return `${steps.toLocaleString('en-US')} צעדים`;
}
