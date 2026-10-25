/**
 * ריצת אירובי סיום ב-localStorage (platform/uiState.ts): משוחזרת אחרי רענון
 * לכל סוג אימון בתוכנית, כולל D (25/10/2026). A/B/C — בלי שינוי; סוג לא מוכר → null.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CardioSession } from '../cardioSession';

const mem = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

let ui: typeof import('../../platform/uiState');

beforeAll(async () => {
  (globalThis as { window?: unknown }).window = { localStorage };
  ui = await import('../../platform/uiState');
});
afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});
beforeEach(() => mem.clear());

const session = (t: 'A' | 'B' | 'C' | 'D'): CardioSession => ({
  target: { kind: 'finisher', workoutId: `2026-10-25-x-${t}`, t, d: '2026-10-25' },
  mode: 'treadmill',
  plannedMinutes: 30,
  startedAt: 1_000_000,
  events: [{ at: 1_000_000, incline: 2.5, speed: 5 }],
});

describe('readCardioSession — אירובי סיום לפי סוג אימון', () => {
  for (const t of ['A', 'B', 'C', 'D'] as const) {
    it(`ריצה שהתחילה באימון ${t} משוחזרת אחרי רענון, כמו שנכתבה`, () => {
      ui.writeCardioSession(session(t));
      expect(ui.readCardioSession()).toEqual(session(t));
    });
  }

  it('סוג לא מוכר (E) → null; אין ריצה → null', () => {
    const s = session('A');
    ui.writeCardioSession({ ...s, target: { ...s.target, t: 'E' as 'A' } } as CardioSession);
    expect(ui.readCardioSession()).toBeNull();
    ui.writeCardioSession(null);
    expect(ui.readCardioSession()).toBeNull();
  });

  it('ריצה עצמאית — בלי שינוי', () => {
    const s: CardioSession = { ...session('A'), target: { kind: 'standalone', id: 'c1', d: '2026-10-25', note: '' } };
    ui.writeCardioSession(s);
    expect(ui.readCardioSession()).toEqual(s);
  });
});
