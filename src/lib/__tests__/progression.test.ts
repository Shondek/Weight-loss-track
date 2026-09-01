import { describe, it, expect } from 'vitest';
import { getProgressionSuggestion, suggestedNextWeight } from '../progression';
import { le } from './helpers';

const text = (...args: Parameters<typeof getProgressionSuggestion>) =>
  getProgressionSuggestion(...args).text;
const kind = (...args: Parameters<typeof getProgressionSuggestion>) =>
  getProgressionSuggestion(...args).kind;

describe('כל הסטים בתקרה — תוספת משקל לפי סוג התנועה', () => {
  it('מורכב: +5 ק״ג', () => {
    // לחיצת רגליים, compound, יעד 10–12
    const s = getProgressionSuggestion(le('leg-press', 60, [12, 12, 12]));
    expect(s.kind).toBe('add-weight');
    expect(s.text).toBe('הוסף 5 ק״ג, חזור ל-10 חזרות');
  });

  it('בידוד: +2.5 ק״ג — גם כשזו מכונה', () => {
    // פשיטת ברך היא בידוד על מכונה. הסיווג הישן לפי ציוד נתן לה 5.
    const s = getProgressionSuggestion(le('leg-extension', 30, [15, 15]));
    expect(s.kind).toBe('add-weight');
    expect(s.text).toBe('הוסף 2.5 ק״ג, חזור ל-12 חזרות');
  });

  it('20 חזרות בטווח 10–12: בידוד +2.5, מורכב +5', () => {
    expect(text(le('cable-curl', 15, [20, 20]))).toContain('2.5');
    expect(text(le('leg-press', 60, [20, 20, 20]))).toContain('5 ק״ג');
  });

  it('חריגה מעל התקרה נחשבת השלמה', () => {
    expect(kind(le('leg-press', 60, [14, 13, 12]))).toBe('add-weight');
  });
});

describe('משקל גוף ותוספת אפס — חזרות, לא משקל', () => {
  it('סקוואט בולגרי לא מציע תוספת משקל בשום מצב', () => {
    const s = getProgressionSuggestion(le('bulgarian-split-squat', null, [10, 10, 10]));
    expect(s.kind).toBe('add-reps');
    expect(s.text).not.toContain('ק״ג');
  });

  it('גם עם משקל רשום, בולגרי לא יעלה משקל', () => {
    expect(kind(le('bulgarian-split-squat', 8, [12, 12, 12]))).toBe('add-reps');
    expect(suggestedNextWeight(le('bulgarian-split-squat', 8, [12, 12, 12]))).toBe(8);
  });

  it('כפיפות בטן בכבל — ליבה עם משקל, מקבלת חזרות ולא "+0 ק״ג"', () => {
    const s = getProgressionSuggestion(le('cable-crunch', 20, [12, 12, 12]));
    expect(s.kind).toBe('add-reps');
    expect(s.text).toBe('טווח הושלם — הוסף חזרות או האט את הקצב.');
    expect(s.text).not.toContain('0 ק״ג');
  });

  it('תרגיל זמן מדבר בשניות', () => {
    const s = getProgressionSuggestion(le('plank', null, [45, 45, 45]));
    expect(s.text).toBe('טווח הושלם — הארך את הזמן או האט את הקצב.');
  });
});

describe('תרגיל של שני סטים — לא מניחים שלושה', () => {
  it('שני סטים בתקרה נחשבים השלמה', () => {
    expect(kind(le('pec-deck', 25, [15, 15]))).toBe('add-weight');
  });

  it('שני סטים, אחד מתחת למינימום', () => {
    expect(kind(le('pec-deck', 25, [15, 11]))).toBe('hold');
  });

  it('שני סטים באמצע הטווח', () => {
    expect(kind(le('pec-deck', 25, [13, 13]))).toBe('add-reps');
  });
});

describe('בתוך הטווח', () => {
  it('חלק מהסטים מתחת לתקרה — מוסיפים חזרות', () => {
    const s = getProgressionSuggestion(le('leg-press', 60, [12, 11, 10]));
    expect(s.kind).toBe('add-reps');
    expect(s.text).toBe('+1–2 חזרות בכל סט בפעם הבאה');
  });

  it('בדיוק על המינימום אינו כישלון', () => {
    expect(kind(le('leg-press', 60, [10, 10, 10]))).toBe('add-reps');
  });

  it('בתרגיל זמן הניסוח בשניות', () => {
    expect(text(le('plank', null, [35, 35, 35]))).toBe('+1–2 שניות בכל סט בפעם הבאה');
  });
});

describe('מתחת למינימום — נבדק לפני "הכול בתקרה"', () => {
  it('סט אחד מתחת למינימום מנצח סט בתקרה', () => {
    const s = getProgressionSuggestion(le('leg-press', 60, [12, 12, 9]));
    expect(s.kind).toBe('hold');
    expect(s.text).toBe('אותו משקל בפעם הבאה. לא יורדים.');
  });

  it('פעם שנייה ברצף באותו תרגיל — יורדים מדרגה', () => {
    const prev = le('leg-press', 60, [9, 9, 8]);
    const now = le('leg-press', 60, [9, 10, 9]);
    expect(kind(now, prev)).toBe('deload');
    expect(text(now, prev)).toBe('פעם שנייה ברצף — רד מדרגה אחת ובנה מחדש.');
  });

  it('כישלון אחרי אימון תקין נשאר "אותו משקל"', () => {
    const prev = le('leg-press', 60, [12, 12, 11]);
    expect(kind(le('leg-press', 60, [9, 9, 9]), prev)).toBe('hold');
  });

  it('בלי היסטוריה — כישלון ראשון', () => {
    expect(kind(le('leg-press', 60, [8, 8, 8]), null)).toBe('hold');
  });
});

describe('סטים חלקיים וריקים', () => {
  it('בלי אף סט שבוצע — אין המלצה', () => {
    const s = getProgressionSuggestion(le('leg-press', 60, [null, null, null]));
    expect(s.kind).toBe('none');
    expect(s.text).toBe('');
  });

  it('סט ריק אינו כישלון — נספרים רק סטים שבוצעו', () => {
    expect(kind(le('leg-press', 60, [12, 12, null]))).toBe('add-weight');
  });

  it('סט אחד בלבד, בתקרה', () => {
    expect(kind(le('leg-press', 60, [12, null, null]))).toBe('add-weight');
  });
});

describe('suggestedNextWeight', () => {
  it('מעלה במשקל כשההמלצה היא לעלות', () => {
    expect(suggestedNextWeight(le('leg-press', 60, [12, 12, 12]))).toBe(65);
    expect(suggestedNextWeight(le('leg-extension', 30, [15, 15]))).toBe(32.5);
  });

  it('משאיר את המשקל בכל מצב אחר', () => {
    expect(suggestedNextWeight(le('leg-press', 60, [11, 11, 11]))).toBe(60);
    expect(suggestedNextWeight(le('leg-press', 60, [8, 8, 8]))).toBe(60);
  });

  it('בלי משקל רשום — null', () => {
    expect(suggestedNextWeight(le('plank', null, [45, 45, 45]))).toBeNull();
  });

  it('לוקח את המשקל של הסט האחרון שיש בו משקל', () => {
    const dropSet = le('leg-press', 60, [12, 12, 12]);
    dropSet.sets[2] = { weight: 50, reps: 12, seconds: null };
    expect(suggestedNextWeight(dropSet)).toBe(55);
  });
});
