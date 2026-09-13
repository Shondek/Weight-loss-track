import { WEEK_LENGTH } from '../lib/weights';

/**
 * רמת הביטחון של ממוצע שבועי, לפי מספר השקילות בלבד.
 * זה קידוד של *מלאות הנתון*, לא של הצלחה: הצבע אומר "כמה אפשר לסמוך
 * על המספר", לעולם לא "לאן הוא הולך". כיוון השינוי נשאר בלי צבע.
 */
export type Confidence = 'high' | 'mid' | 'low';

const MID_MIN = 4;

export function confidenceOf(count: number): Confidence {
  if (count >= WEEK_LENGTH) return 'high';
  if (count >= MID_MIN) return 'mid';
  return 'low';
}
