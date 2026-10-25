/**
 * פרופיל המכשיר (25/10/2026): בלי פרופיל — הכול כמו היום; `partner` — אימונים,
 * היסטוריה, גיבוי והגדרות בלבד; שומר הבטיחות — החלפה רק במכשיר ריק.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { emptyDb, type DB } from '../../types';
import { activeProfile, parseProfile, PROFILE_STORAGE_KEY, setActiveProfile } from '../../data/profile';
import { STORAGE_KEYS, BACKUP_KEYS, META_KEYS } from '../store';
import {
  ALL_TABS,
  PARTNER_TABS,
  SWITCH_BLOCKED_TEXT,
  canSwitchProfile,
  dataFeatures,
  defaultTab,
  deviceHasRecords,
  visibleTabs,
  workoutFeatures,
} from '../profile';
import { le, wk } from './helpers';

afterEach(() => setActiveProfile(null));

describe('הפרופיל הפעיל', () => {
  it('ברירת המחדל היא null — אין פרופיל — וזה מה שהבדיקות האחרות רואות', () => {
    expect(activeProfile()).toBeNull();
  });

  it('parseProfile: רק "partner" הוא פרופיל; כל ערך אחר = אין פרופיל', () => {
    expect(parseProfile('partner')).toBe('partner');
    for (const v of [undefined, null, '', 'shon', 'PARTNER', 1, {}, ['partner']]) expect(parseProfile(v)).toBeNull();
  });

  it('מפתח אחסון חדש אחד, בתוספת: fatloss:profile — לא ב-STORAGE_KEYS, לא בגיבוי, לא במטא', () => {
    expect(PROFILE_STORAGE_KEY).toBe('fatloss:profile');
    const existing = [...Object.values(STORAGE_KEYS), ...Object.values(BACKUP_KEYS), ...Object.values(META_KEYS)];
    expect(existing).not.toContain(PROFILE_STORAGE_KEY);
    // המפתחות הקיימים לא השתנו.
    expect(Object.values(STORAGE_KEYS).sort()).toEqual(
      [
        'fatloss:weights',
        'fatloss:workouts',
        'fatloss:waist',
        'fatloss:checkins',
        'fatloss:cardio-standalone',
        'fatloss:settings',
        'fatloss:customFoods',
        'fatloss:entries',
        'fatloss:targets',
        'fatloss:favorites',
        'fatloss:days',
        'fatloss:creatine',
        'fatloss:quarantine',
      ].sort(),
    );
  });
});

describe('ניווט — snapshot', () => {
  it('בלי פרופיל: חמש הלשוניות, באותו סדר כמו היום; הפתיחה במשקל', () => {
    expect(visibleTabs(null)).toEqual(['weight', 'nutrition', 'workout', 'checkin', 'data']);
    expect(visibleTabs(null)).toBe(ALL_TABS);
    expect(defaultTab(null)).toBe('weight');
    expect(visibleTabs(null)).toMatchSnapshot();
  });

  it('partner: אימונים ונתונים בלבד; הפתיחה באימונים; משקל/תזונה/צ׳ק-אין אינם ברשימה', () => {
    expect(visibleTabs('partner')).toEqual(['workout', 'data']);
    expect(visibleTabs('partner')).toBe(PARTNER_TABS);
    expect(defaultTab('partner')).toBe('workout');
    for (const hidden of ['weight', 'nutrition', 'checkin'] as const) {
      expect(visibleTabs('partner')).not.toContain(hidden);
    }
  });

  it('בלי פרופיל כל הדגלים דולקים (כמו היום); partner — בלי כאב, אילוצים, אירובי, מונה ותזונה', () => {
    expect(workoutFeatures(null)).toEqual({ constraints: true, pain: true, cardio: true, weeklyCounter: true });
    expect(dataFeatures(null)).toEqual({ nutrition: true });
    expect(workoutFeatures('partner')).toEqual({ constraints: false, pain: false, cardio: false, weeklyCounter: false });
    expect(dataFeatures('partner')).toEqual({ nutrition: false });
  });
});

describe('שומר הבטיחות — החלפת פרופיל רק במכשיר ריק', () => {
  const one = (over: Partial<DB>): DB => ({ ...emptyDb(), ...over });
  const cases: Record<string, Partial<DB>> = {
    'שקילה': { weights: [{ d: '2026-10-01', w: 80 }] },
    'אימון': { workouts: [wk('w1', '2026-10-01', 'A', [le('leg-press', 60, [10, 10])])] },
    'אימון ישן שלא הומר': { legacyWorkouts: [{ raw: { x: 1 }, d: null, reason: 'x' }] },
    'מותניים': { waist: [{ d: '2026-10-01', cm: 90 }] },
    "צ'ק-אין": { checkins: [{ weekStart: '2026-09-27', adherence: 5, hunger: null, energy: null, sleepHours: null, unplannedSnackDays: null, note: '' }] },
    'אירובי עצמאי': { standaloneCardio: [{ id: 'c1', d: '2026-10-01', mode: 'bike', minutes: 30, incline: null, speed: null, note: '' }] },
    'מזון': { customFoods: [{ id: 'c:1', name: 'x', cat: null, kcal: 100, protein: 10, carbs: null, fat: null, fiber: null, portions: [], barcode: null }] },
    'רישום אכילה': { entries: [{ id: 'e1', d: '2026-10-01', ts: 1, meal: 'lunch', foodId: 'c:1', grams: 100, ref: { name: 'x', kcal: 100, protein: 10, carbs: null, fat: null, fiber: null } }] },
    'יעד תזונה': { targets: [{ from: '2026-10-01', kcal: 2000, protein: 150, carbs: 200, fat: 60 }] },
    'מועדף': { favorites: [{ foodId: 'c:1', grams: null }] },
    'צעדים (יום)': { days: [{ d: '2026-10-01', closed: false, steps: 8000 }] },
    'קריאטין': { creatine: [{ d: '2026-10-01', taken: true, at: '2026-10-01T08:00:00Z', dose_g: 5 }] },
    'הסגר': { quarantine: [{ key: 'weights', raw: {}, reason: 'x', at: '2026-10-01T08:00:00Z', fp: '{}' }] },
  };

  it('מכשיר ריק → אפשר להחליף, לכל כיוון', () => {
    expect(deviceHasRecords(emptyDb())).toBe(false);
    expect(canSwitchProfile(emptyDb())).toBe(true);
    // הגדרות אינן רשומה: צליל, תחילת תוכנית ותאריך גיבוי לא חוסמים.
    expect(canSwitchProfile(one({ settings: { programStart: '2026-09-27', soundEnabled: false, lastBackup: '2026-10-01' } }))).toBe(true);
  });

  for (const [name, over] of Object.entries(cases)) {
    it(`רשומה אחת — ${name} — חוסמת את ההחלפה`, () => {
      expect(deviceHasRecords(one(over))).toBe(true);
      expect(canSwitchProfile(one(over))).toBe(false);
    });
  }

  it('ההסבר כשההחלפה מושבתת', () => {
    expect(SWITCH_BLOCKED_TEXT).toBe('אפשר להחליף פרופיל רק במכשיר ריק');
  });
});
