import { describe, it, expect } from 'vitest';
import { matchesSearch, normalizeSearch, searchTerms } from '../nutrition/search';

describe('normalizeSearch', () => {
  it('מסיר ניקוד וטעמים', () => {
    expect(normalizeSearch('לָאבָּנֶה')).toBe('לאבנה');
    expect(normalizeSearch('אָשֵה רֶשְתֶה')).toBe('אשה רשתה');
  });

  it('מסיר פסיקים ומאחד רווחים', () => {
    expect(normalizeSearch('חלב 3% שומן,  תנובה, טרה ')).toBe('חלב 3% שומן תנובה טרה');
    expect(normalizeSearch('  ')).toBe('');
  });

  it('אנגלית לאותיות קטנות; גרש ומקף נשארים', () => {
    expect(normalizeSearch("Milk, Cow, 3% Fat קוטג'")).toBe("milk cow 3% fat קוטג'");
    expect(normalizeSearch('Bread, semi-whole wheat')).toBe('bread semi-whole wheat');
  });

  it('לא משנה טקסט שכבר מנורמל', () => {
    const s = 'שמן זית oil olive';
    expect(normalizeSearch(s)).toBe(s);
  });
});

describe('searchTerms / matchesSearch', () => {
  const field = normalizeSearch('לחם אחיד, כהה, פרוס Bread, semi-whole wheat');

  it('כל המילים חייבות להופיע, בכל סדר', () => {
    expect(matchesSearch(field, searchTerms('פרוס לחם'))).toBe(true);
    expect(matchesSearch(field, searchTerms('לחם לבן'))).toBe(false);
  });

  it('חיפוש באנגלית לא רגיש לאותיות גדולות', () => {
    expect(matchesSearch(field, searchTerms('BREAD'))).toBe(true);
  });

  it('שאילתה ריקה מתאימה להכול', () => {
    expect(searchTerms('   ')).toEqual([]);
    expect(matchesSearch(field, [])).toBe(true);
  });

  it('מילה חלקית מתאימה (תחילית או אמצע)', () => {
    expect(matchesSearch(field, searchTerms('אחי'))).toBe(true);
  });
});
