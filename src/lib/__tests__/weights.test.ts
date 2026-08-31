import { describe, it, expect } from 'vitest';
import {
  lastWeight,
  missingWeighDays,
  removeWeight,
  summarizeWeek,
  upsertWeight,
  weekChange,
  weeklyAverages,
  daysSinceWaist,
  waistBeforeWeek,
  waistInWeek,
  upsertWaist,
} from '../weights';
import type { WeightEntry } from '../../types';

const W = (d: string, w: number): WeightEntry => ({ d, w });

// שבוע 30/08/2026 (ראשון) – 05/09/2026 (שבת)
const FULL: WeightEntry[] = [
  W('2026-08-30', 80.1),
  W('2026-08-31', 80.0),
  W('2026-09-01', 79.8),
  W('2026-09-02', 80.2),
  W('2026-09-03', 79.9),
  W('2026-09-04', 79.9),
  W('2026-09-05', 79.9),
];

describe('summarizeWeek', () => {
  it('שבוע מלא: 7/7, ממוצע ב-2 ספרות', () => {
    const s = summarizeWeek(FULL, '2026-08-30');
    expect(s.count).toBe(7);
    expect(s.complete).toBe(true);
    expect(s.avg).toBe(79.97);
    expect(s.days).toEqual([80.1, 80.0, 79.8, 80.2, 79.9, 79.9, 79.9]);
  });

  it('שבוע חלקי: הממוצע על מה שיש, complete=false', () => {
    const s = summarizeWeek(FULL.slice(0, 4), '2026-08-30');
    expect(s.count).toBe(4);
    expect(s.complete).toBe(false);
    expect(s.avg).toBe(80.03);
    expect(s.days).toEqual([80.1, 80.0, 79.8, 80.2, null, null, null]);
  });

  it('ערך חצי מדויק לא נופל בגלל נקודה צפה', () => {
    // 80.1+80.0+79.8+80.2 = 320.1 בדיוק. חלקי 4 = 80.025 → 80.03.
    // סכימה נאיבית בנקודה צפה נותנת 320.09999999999997 ומעגלת ל-80.02.
    const s = summarizeWeek(FULL.slice(0, 4), '2026-08-30');
    expect(s.avg).toBe(80.03);
  });

  it('שבוע בלי שקילות: ממוצע null', () => {
    const s = summarizeWeek(FULL, '2026-09-06');
    expect(s.count).toBe(0);
    expect(s.avg).toBeNull();
    expect(s.complete).toBe(false);
  });

  it('מתעלם משקילות משבוע אחר', () => {
    const s = summarizeWeek([...FULL, W('2026-09-06', 60)], '2026-08-30');
    expect(s.count).toBe(7);
    expect(s.avg).toBe(79.97);
  });
});

describe('weekChange — השער של "רק שבוע מלא"', () => {
  const prev = summarizeWeek(
    [
      W('2026-08-23', 80.5),
      W('2026-08-24', 80.4),
      W('2026-08-25', 80.3),
      W('2026-08-26', 80.2),
      W('2026-08-27', 80.3),
      W('2026-08-28', 80.2),
      W('2026-08-29', 80.3),
    ],
    '2026-08-23',
  );

  it('שני שבועות מלאים: ירידה בק"ג ובאחוז', () => {
    const cur = summarizeWeek(FULL, '2026-08-30');
    const c = weekChange(cur, prev);
    expect(prev.avg).toBe(80.31);
    expect(cur.avg).toBe(79.97);
    expect(c).toEqual({ drop: 0.34, pct: 0.42, direction: 'down' });
  });

  it('שבוע נוכחי חלקי: null', () => {
    expect(weekChange(summarizeWeek(FULL.slice(0, 6), '2026-08-30'), prev)).toBeNull();
  });

  it('שבוע קודם חלקי: null', () => {
    const partialPrev = summarizeWeek([W('2026-08-23', 80.5)], '2026-08-23');
    expect(weekChange(summarizeWeek(FULL, '2026-08-30'), partialPrev)).toBeNull();
  });

  it('אין שבוע קודם: null', () => {
    expect(weekChange(summarizeWeek(FULL, '2026-08-30'), null)).toBeNull();
  });

  it('עלייה מסומנת ככזו והערכים אי-שליליים', () => {
    const up = summarizeWeek(
      [
        W('2026-08-30', 81.0),
        W('2026-08-31', 81.0),
        W('2026-09-01', 81.0),
        W('2026-09-02', 81.0),
        W('2026-09-03', 81.0),
        W('2026-09-04', 81.0),
        W('2026-09-05', 81.0),
      ],
      '2026-08-30',
    );
    const c = weekChange(up, prev);
    expect(c?.direction).toBe('up');
    expect(c?.drop).toBeCloseTo(0.69, 5);
    expect(c?.pct).toBeGreaterThan(0);
  });

  it('אותו ממוצע: same, אפס', () => {
    const c = weekChange(prev, prev);
    expect(c).toEqual({ drop: 0, pct: 0, direction: 'same' });
  });
});

describe('weeklyAverages', () => {
  it('רצף שבועות בלי חורים, כולל שבוע ריק באמצע', () => {
    const list = [W('2026-08-30', 80), W('2026-09-13', 79)];
    const weeks = weeklyAverages(list);
    expect(weeks.map((w) => w.weekStart)).toEqual([
      '2026-08-30',
      '2026-09-06',
      '2026-09-13',
    ]);
    expect(weeks[1]?.count).toBe(0);
    expect(weeks[1]?.avg).toBeNull();
  });

  it('רשימה ריקה', () => {
    expect(weeklyAverages([])).toEqual([]);
  });
});

describe('upsert / remove', () => {
  it('הזנה חוזרת לאותו תאריך מעדכנת ולא מכפילה', () => {
    let list = upsertWeight([], W('2026-08-30', 80.1));
    list = upsertWeight(list, W('2026-08-30', 79.9));
    expect(list).toEqual([W('2026-08-30', 79.9)]);
  });

  it('שומר על מיון לפי תאריך', () => {
    let list = upsertWeight([], W('2026-09-02', 80));
    list = upsertWeight(list, W('2026-08-30', 81));
    expect(list.map((e) => e.d)).toEqual(['2026-08-30', '2026-09-02']);
  });

  it('מחיקה מסירה רק את התאריך המבוקש', () => {
    expect(removeWeight(FULL, '2026-09-01').map((e) => e.d)).not.toContain('2026-09-01');
    expect(removeWeight(FULL, '2026-09-01')).toHaveLength(6);
  });

  it('lastWeight לפי תאריך, לא לפי סדר במערך', () => {
    expect(lastWeight([W('2026-09-05', 1), W('2026-08-30', 2)])?.d).toBe('2026-09-05');
    expect(lastWeight([])).toBeNull();
  });
});

describe('missingWeighDays', () => {
  it('סופר רק עד היום הנוכחי', () => {
    const list = [W('2026-08-30', 80), W('2026-09-01', 80)];
    expect(missingWeighDays(list, '2026-08-30', '2026-09-02')).toEqual([
      '2026-08-31',
      '2026-09-02',
    ]);
  });

  it('שבוע מלא: אין חסרים', () => {
    expect(missingWeighDays(FULL, '2026-08-30', '2026-09-05')).toEqual([]);
  });
});

describe('מותניים', () => {
  const waist = [
    { d: '2026-08-23', cm: 96.0 },
    { d: '2026-09-02', cm: 95.5 },
  ];

  it('המדידה של השבוע והמדידה שלפניו', () => {
    expect(waistInWeek(waist, '2026-08-30')?.cm).toBe(95.5);
    expect(waistBeforeWeek(waist, '2026-08-30')?.cm).toBe(96.0);
    expect(waistInWeek(waist, '2026-09-06')).toBeNull();
  });

  it('שתי מדידות באותו שבוע — האחרונה קובעת', () => {
    const two = upsertWaist(waist, { d: '2026-09-04', cm: 95.0 });
    expect(waistInWeek(two, '2026-08-30')?.cm).toBe(95.0);
  });

  it('ימים מאז המדידה האחרונה', () => {
    expect(daysSinceWaist(waist, '2026-09-09')).toBe(7);
    expect(daysSinceWaist([], '2026-09-09')).toBeNull();
  });
});
