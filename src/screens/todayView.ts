/**
 * לוגיקת תצוגה טהורה של מסך "היום". בלי DOM, בלי אחסון, בלי חישוב חדש:
 * כל מספר שמוצג במסך מגיע מ-src/lib; כאן רק ההחלטה *איך* להציג אותו.
 */

import type { ISODate, WaistEntry } from '../types';
import { compareISO, dayLetter, dayName, dayOfWeek, weekDays, weekStart } from '../lib/date';
import { WAIST_DAY, waistBeforeWeek } from '../lib/weights';
import type { DayDot } from '../ui/DayDots';

/**
 * מצב אריח המותניים לפי היום בשבוע:
 *  - `measured` — נמדד ברביעי (או בחמישי כשאין רביעי) של השבוע הנוכחי.
 *    רק זו מדידה "תקינה" של השבוע — אותו כלל כמו בסיכום השבועי.
 *  - `measured-other` — נמדד השבוע ביום אחר. מוצג ניטרלי, לא כ"תקין".
 *  - `upcoming` — עוד לא נמדד, א'–ג': המדידה לפנינו.
 *  - `due` — עוד לא נמדד, ד'–ה': היום מודדים.
 *  - `missed` — לא נמדד, ו'–ש': השבוע הוחמץ. לא מבקשים למדוד.
 */
export type WaistStatusKind = 'measured' | 'measured-other' | 'upcoming' | 'due' | 'missed';

export type WaistStatus = {
  kind: WaistStatusKind;
  /** המדידה של השבוע הנוכחי שנבחרה להצגה, או null. */
  inWeek: WaistEntry | null;
  /** המדידה האחרונה שלפני השבוע הנוכחי ("קודם" / "אחרון"), או null. */
  previous: WaistEntry | null;
  /** שם היום של `inWeek` ("רביעי"), לכיתוב הצ'יפ. */
  measuredDay: string | null;
};

export function waistStatus(list: readonly WaistEntry[], today: ISODate): WaistStatus {
  const ws = weekStart(today);
  const days = weekDays(ws);
  const previous = waistBeforeWeek(list, ws);
  const on = (d: ISODate | undefined) => (d ? (list.find((e) => e.d === d) ?? null) : null);

  // רביעי קודם, חמישי אחריו — כמו הסיכום השבועי.
  const valid = on(days[WAIST_DAY]) ?? on(days[WAIST_DAY + 1]);
  if (valid) return { kind: 'measured', inWeek: valid, previous, measuredDay: dayName(valid.d) };

  // מדידה ביום אחר בשבוע הזה (עד היום): האחרונה שבהן.
  let other: WaistEntry | null = null;
  for (const e of list) {
    if (compareISO(e.d, ws) < 0 || compareISO(e.d, today) > 0) continue;
    if (!other || compareISO(e.d, other.d) > 0) other = e;
  }
  if (other) return { kind: 'measured-other', inWeek: other, previous, measuredDay: dayName(other.d) };

  const dow = dayOfWeek(today);
  const kind: WaistStatusKind = dow < WAIST_DAY ? 'upcoming' : dow <= WAIST_DAY + 1 ? 'due' : 'missed';
  return { kind, inWeek: null, previous, measuredDay: null };
}

/**
 * שבע נקודות השבוע: יש שקילה / חסר / עתיד, והיום מסומן. בלי ערכים —
 * רק קיום. `days` הם שבעת הערכים של `WeekSummary.days` (null = לא נשקל).
 */
export function weekDots(ws: ISODate, days: readonly (number | null)[], today: ISODate): DayDot[] {
  return weekDays(ws).map((d, i) => {
    const has = (days[i] ?? null) !== null;
    const future = compareISO(d, today) > 0;
    const state = has ? 'done' : future ? 'future' : 'missing';
    const word = has ? 'נשקל' : future ? 'עדיין לא' : 'חסר';
    return {
      key: d,
      letter: dayLetter(d),
      state,
      today: d === today,
      label: `${dayName(d)}: ${word}${d === today ? ' (היום)' : ''}`,
    };
  });
}
