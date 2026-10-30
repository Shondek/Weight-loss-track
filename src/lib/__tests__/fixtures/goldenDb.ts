/**
 * בסיס נתונים דטרמיניסטי לבדיקות golden-file של הגיבוי. כל מפתח מאוכלס,
 * כולל רשומות עם שדות אופציונליים (RIR, החלפה, מקטעים, צעדים, מתכון, ידני,
 * אימון ישן שלא הומר, הסגר). לא חלק מקוד האפליקציה.
 *
 * `backup-golden-before.json` נוצר מהבסיס הזה בגרסה שלפני הוספת השדה `profile`
 * (ייצוא עם הזחה). הוא מוקפא: הבדיקות מוודאות שהוא נטען בלי שינוי.
 */

import type { DB } from '../../../types';
import { emptyDb } from '../../../types';
import { le, wk } from '../helpers';

export function goldenDb(): DB {
  const db = emptyDb();
  db.weights = [
    { d: '2026-08-30', w: 86.4 },
    { d: '2026-08-31', w: 86.1 },
    { d: '2026-09-01', w: 86.3 },
    { d: '2026-09-02', w: 85.9 },
    { d: '2026-09-03', w: 85.8 },
    { d: '2026-09-04', w: 85.7 },
    { d: '2026-09-05', w: 85.5 },
    { d: '2026-09-06', w: 85.6 },
    { d: '2026-09-08', w: 85.2 },
  ];
  db.waist = [
    { d: '2026-09-02', cm: 96.5 },
    { d: '2026-09-09', cm: 96 },
  ];
  db.workouts = [
    wk(
      '2026-08-30-00abc-A',
      '2026-08-30',
      'A',
      [
        le('warmup', null, [], {
          n: 'חימום',
          sets: [{ weight: null, reps: null, seconds: 600 }],
          type: 'cardio',
          bodyweightOnly: true,
          targetRepMin: 0,
          targetRepMax: 0,
          cardio: { mode: 'bike', minutes: 10 },
        }),
        le('leg-press', 90, [12, 12, 11], { rir: 2 }),
        le('smith-bench-press', 40, [10, 10, 9], { rir: 1 }),
        le('plank', null, [60, 60, 45]),
        le('finisher-cardio', null, [], {
          n: 'אירובי',
          sets: [{ weight: null, reps: null, seconds: 1200 }],
          type: 'cardio',
          bodyweightOnly: true,
          targetRepMin: 0,
          targetRepMax: 0,
          cardio: {
            mode: 'treadmill',
            minutes: 20,
            incline: 5,
            speed: 5.5,
            segments: [
              { minutes: 5, incline: 2, speed: 5 },
              { minutes: 15, incline: 5, speed: 5.5 },
            ],
            steps: 2400,
          },
        }),
      ],
      2,
      1,
    ),
    wk(
      '2026-09-01-00abd-B',
      '2026-09-01',
      'B',
      [
        le('barbell-rdl', 60, [10, 10, 8], { rir: 2 }),
        le('seated-cable-row', 50, [12, 12, 12]),
        // החלפה חד-פעמית: חלופה במקום פרפר
        le('cable-low-fly', 15, [15, 15], { swappedFrom: 'pec-deck', targetRepMin: 10, targetRepMax: 12 }),
        le('floor-leg-raise', null, [15, 14, 12]),
      ],
      0,
      0,
    ),
    wk('2026-09-03-00abe-C', '2026-09-03', 'C', [le('leg-press', 92.5, [12, 12, 12], { rir: 3 })], null, null),
  ];
  db.legacyWorkouts = [
    {
      raw: { id: 'old-1', d: 'nope', t: 'A', ex: [{ n: 'לג פרס', w: 60, r: [12, 12, 12] }] },
      d: 'nope',
      reason: 'תאריך לא תקין',
    },
  ];
  db.checkins = [
    {
      weekStart: '2026-08-30',
      adherence: 8,
      hunger: 4,
      energy: 7,
      sleepHours: 6.5,
      unplannedSnackDays: 1,
      note: 'שבוע טוב',
      homeLunchDays: 3,
    },
    {
      weekStart: '2026-09-06',
      adherence: 6,
      hunger: null,
      energy: null,
      sleepHours: null,
      unplannedSnackDays: null,
      note: '',
    },
  ];
  db.standaloneCardio = [
    {
      id: '2026-09-02-00abf-cardio',
      d: '2026-09-02',
      mode: 'treadmill',
      minutes: 45,
      incline: 2.5,
      speed: 5,
      note: 'הליכה קלה',
      segments: [{ minutes: 45, incline: 2.5, speed: 5 }],
      steps: 5600,
    },
    { id: '2026-09-05-00abg-cardio', d: '2026-09-05', mode: 'bike', minutes: 30, incline: null, speed: null, note: '' },
  ];
  db.settings = { programStart: '2026-08-30', soundEnabled: false, lastBackup: '2026-09-04' };
  // בסדר שהפרסר מחזיר (ממוין לפי שם) — כדי שהמסד יהיה נקודת שבת של ייצוא→ייבוא.
  db.customFoods = [
    {
      id: 'c:rice0001',
      name: 'אורז לבן מבושל',
      cat: null,
      kcal: 130,
      protein: 2.7,
      carbs: 28,
      fat: null,
      fiber: 0.4,
      portions: [{ u: 'כוס', g: 160 }],
      barcode: '7290000000001',
    },
    {
      id: 'c:egg00001',
      name: 'ביצה',
      cat: 2,
      kcal: 7200,
      protein: 600,
      carbs: 50,
      fat: 500,
      fiber: 0,
      portions: [],
      barcode: null,
      unitFood: true,
      archived: true,
    },
    {
      id: 'c:chicken1',
      name: 'חזה עוף צלוי',
      cat: 3,
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: 0,
      portions: [{ u: 'מנה', g: 150 }],
      barcode: null,
      note: 'מהתווית',
    },
    {
      id: 'c:bowl0001',
      name: 'קערת עוף ואורז',
      cat: null,
      kcal: 149,
      protein: 15.8,
      carbs: 15,
      fat: 2,
      fiber: 0.2,
      portions: [],
      barcode: null,
      recipe: {
        items: [
          { foodId: 'c:chicken1', grams: 150, u: 'מנה', n: 'חזה עוף' },
          { foodId: 'c:rice0001', grams: 160, u: 'כוס' },
        ],
        finalGrams: 290,
      },
    },
  ];
  const ref = (f: DB['customFoods'][number]) => ({
    name: f.name,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    ...(f.unitFood ? { unitFood: true as const } : {}),
  });
  db.entries = [
    { id: '000000001-a', d: '2026-09-05', ts: 1788000000000, meal: 'breakfast', foodId: 'c:egg00001', grams: 2, ref: ref(db.customFoods[1]!) },
    { id: '000000002-b', d: '2026-09-05', ts: 1788020000000, meal: 'lunch', foodId: 'c:bowl0001', grams: 290, ref: ref(db.customFoods[3]!), note: 'ארוחת צהריים' },
    {
      id: '000000003-c',
      d: '2026-09-05',
      ts: 1788040000000,
      meal: 'dinner',
      foodId: 'c:adhoc',
      grams: 1,
      n: 'המבורגר במסעדה',
      adhoc: true,
      ref: { name: 'המבורגר במסעדה', kcal: 850, protein: 45, carbs: null, fat: null, fiber: null },
    },
    { id: '000000004-d', d: '2026-09-06', ts: 1788100000000, meal: 'snack', foodId: 'c:chicken1', grams: 120, ref: ref(db.customFoods[2]!) },
  ];
  db.targets = [
    { from: '2026-08-30', kcal: 2100, protein: 165, carbs: 200, fat: 70 },
    { from: '2026-09-06', kcal: 2000, protein: 170, carbs: 190, fat: 65 },
  ];
  db.favorites = [
    { foodId: 'c:chicken1', grams: 150 },
    { foodId: 'c:rice0001', grams: null },
  ];
  db.days = [
    { d: '2026-09-04', closed: true, closedAt: '2026-09-04T20:10:00.000Z', fridayTier: 'regular', steps: 8400 },
    { d: '2026-09-05', closed: true, closedAt: '2026-09-05T21:00:00.000Z' },
    { d: '2026-09-06', closed: false, steps: 6100 },
  ];
  db.creatine = [
    { d: '2026-09-05', taken: true, at: '2026-09-05T06:05:00.000Z', dose_g: 5 },
    { d: '2026-09-06', taken: true, at: '2026-09-06T06:10:00.000Z', dose_g: 5 },
  ];
  db.quarantine = [
    {
      key: 'weights',
      raw: { d: '2026-09-07', w: 850 },
      reason: 'משקל מחוץ לטווח 20–400 ק"ג',
      at: '2026-09-07T05:00:00.000Z',
      fp: '{"d":"2026-09-07","w":850}',
    },
  ];
  return db;
}
