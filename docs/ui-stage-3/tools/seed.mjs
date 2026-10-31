/**
 * נתוני דמה למסך האימון — נכתבים ישירות ל-IndexedDB (`keyval-store`/`keyval`)
 * דרך Playwright. אותם 13 מפתחות של האפליקציה + סמן המיגרציה. כלי עבודה
 * לצילומים ולבדיקות השוויון בלבד; לא נכנס ל-build.
 *
 * היסטוריית אימונים ריאליסטית: A→B→C שלוש פעמים בשבוע (ו׳, ב׳, ד׳) מ-11/09/2026
 * ועד יום רביעי 28/10/2026 (C), כך שביום שישי 30/10 "הבא בתור" הוא A.
 * כל תרגיל בתוכנית נרשם עם משקל, חזרות ו-RIR, חוץ מ:
 *   - A3 (פולי עליון): אף פעם לא נרשם → סשן כיול (אין הצעה).
 *   - A2 (בנץ׳ סמית): הסשן האחרון בלי RIR → "אשר בעצמך".
 *   - A6 (פשיטת ירך): משקל גוף (null), תקרה → R4.
 *   - A8 (פלאנק): 60 שנ׳ × 3, בלי משקל → שימור (M).
 *   - D: אף פעם.
 * התוכנית נקראת מ-src/data/program-abc.json כדי שהשורות יתאימו לתוכנית.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = JSON.parse(fs.readFileSync(path.join(HERE, '../../../src/data/program-abc.json'), 'utf8'));
const PARTNER = JSON.parse(fs.readFileSync(path.join(HERE, '../../../src/data/program-partner.json'), 'utf8'));

const START = '2026-09-06'; // ראשון, שבוע 1
const FIRST_WORKOUT = '2026-09-11'; // שישי: A
const KEYS = {
  weights: 'fatloss:weights',
  workouts: 'fatloss:workouts',
  waist: 'fatloss:waist',
  checkins: 'fatloss:checkins',
  standaloneCardio: 'fatloss:cardio-standalone',
  settings: 'fatloss:settings',
  customFoods: 'fatloss:customFoods',
  entries: 'fatloss:entries',
  targets: 'fatloss:targets',
  favorites: 'fatloss:favorites',
  days: 'fatloss:days',
  creatine: 'fatloss:creatine',
  quarantine: 'fatloss:quarantine',
};
const MARKER = 'fatloss:meta:ls-migrated';
const PROFILE = 'fatloss:profile';

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(s, n) {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

/** משקל "אמיתי" ליום: ירידה של ~0.35 ק"ג לשבוע + רעש יומי דטרמיניסטי. */
function weightOn(d) {
  const n = diffDays(START, d);
  const trend = 97.8 - (0.35 * n) / 7;
  const noise = [0.2, -0.1, 0.3, 0, -0.2, 0.1, -0.3][n % 7];
  return Math.round((trend + noise) * 10) / 10;
}

/** משקל פתיחה לכל תרגיל (ק״ג). תרגיל שלא כאן מתחיל ב-20. */
const BASE = {
  'leg-press': 120,
  'smith-bench-press': 40,
  'leg-extension': 35,
  'leg-curl': 30,
  'back-extension': null, // משקל גוף
  'db-lateral-raise-seated': 7.5,
  plank: null,
  'barbell-rdl': 50,
  'seated-cable-row': 45,
  'pec-deck': 40,
  'face-pull': 20,
  'db-supinated-curl': 10,
  'triceps-pushdown': 25,
  'floor-leg-raise': null,
  'machine-hip-abduction': 50,
  'machine-row': 45,
  'smith-incline-bench-press': 35,
  'db-lateral-raise-standing': 7.5,
  'ez-bar-preacher-curl': 20,
  'cable-torso-rotation': 15,
};
/** תרגילים שלא נרשמים אף פעם (סשן כיול). */
const NEVER = new Set(['lat-pulldown']);
/** תרגיל שהסשן האחרון שלו בלי RIR. */
const NO_RIR_LAST = 'smith-bench-press';

/**
 * שורת תרגיל באימון ה-k של הסוג (k מ-0). ברירת המחדל: תקרה עם RIR 2 בסשן
 * האחרון (→ R1), ולפני כן התקדמות הדרגתית בחזרות באותו משקל.
 */
function loggedExercise(spec, k, isLast) {
  const sets = spec.sets;
  const min = spec.repRangeMin;
  const max = spec.repRangeMax;
  const timed = spec.isTimed === true;
  const bwOnly = spec.bodyweightOnly === true;
  // null מפורש = משקל גוף (A6, פלאנק, B8); תרגיל שלא ברשימה מתחיל ב-20.
  const base = spec.id in BASE ? BASE[spec.id] : 20;
  const step = spec.step ?? 5;
  // משקל: עולה ב-step כל 3 אימונים של הסוג; משקל גוף נשאר null.
  const weight = base === null || bwOnly ? null : base + step * Math.floor(k / 3);
  // חזרות: עולות מהרצפה לתקרה לאורך 3 אימונים, ובאחרון תקרה בכל הסטים.
  const phase = k % 3;
  const target = isLast ? max : Math.min(max, min + phase);
  const reps = Array.from({ length: sets }, (_, i) => Math.max(min, target - (isLast ? 0 : i)));
  const e = {
    exerciseId: spec.id,
    n: spec.name,
    sets: reps.map((r) => ({ weight: bwOnly ? null : weight, reps: timed ? null : r, seconds: timed ? (isLast ? 60 : 45 + phase * 5) : null })),
    targetRepMin: min,
    targetRepMax: max,
    type: spec.type,
    bodyweightOnly: bwOnly,
    assisted: spec.assisted === true,
  };
  if (!(isLast && spec.id === NO_RIR_LAST)) e.rir = isLast ? 2 : 1 + (k % 2);
  return e;
}

/**
 * @param {object} o
 * @param {string} o.today  התאריך של התרחיש
 * @param {string} [o.time]
 * @param {'partner'|null} [o.profile]
 * @param {boolean} [o.emptyWorkouts]  בלי היסטוריית אימונים בכלל (סשן כיול מלא)
 */
export function buildSeed(o) {
  const today = o.today;
  const weights = [];
  for (let d = START; d < today; d = addDays(d, 1)) weights.push({ d, w: weightOn(d) });

  const waist = [];
  const thisWeekStart = addDays(today, -fromISO(today).getDay());
  let cm = 99.0;
  for (let d = '2026-09-09'; d < thisWeekStart; d = addDays(d, 7)) {
    waist.push({ d, cm: Math.round(cm * 2) / 2 });
    cm -= 0.35;
  }

  // אימונים A→B→C, שלושה בשבוע (ו׳, ב׳, ד׳), מ-11/09 עד היום (לא כולל).
  const program = o.profile === 'partner' ? PARTNER : PROGRAM;
  // הסבב בלבד: D אופציונלי ומחוץ לסבב (בת הזוג: A↔B).
  const types = program.workouts.map((w) => w.code).filter((t) => t !== 'D');
  const dates = [];
  for (let d = FIRST_WORKOUT; d < today; d = addDays(d, 1)) {
    const dow = fromISO(d).getDay();
    if (dow === 1 || dow === 3 || dow === 5) dates.push(d);
  }
  const perType = Object.fromEntries(types.map((t) => [t, 0]));
  const counts = {};
  for (const [i, d] of dates.entries()) counts[d] = types[i % types.length];
  const lastOfType = {};
  for (const d of dates) lastOfType[counts[d]] = d;
  const workouts = [];
  if (!o.emptyWorkouts) {
    for (const d of dates) {
      const t = counts[d];
      const k = perType[t]++;
      const isLast = lastOfType[t] === d;
      const w = program.workouts.find((x) => x.code === t);
      const ex = w.exercises.filter((spec) => !NEVER.has(spec.id)).map((spec) => loggedExercise(spec, k, isLast));
      workouts.push({ schemaVersion: 2, id: `${d}-seed-${t}`, d, t, ex, knee: k % 4 === 0 ? 1 : 0, shoulder: 0 });
    }
  }

  const days = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(today, -i);
    days.push({ d, closed: true, closedAt: `${d}T21:30:00.000Z`, steps: 7200 + (i % 5) * 600 });
  }

  const data = {
    [KEYS.weights]: weights,
    [KEYS.workouts]: workouts,
    [KEYS.waist]: waist,
    [KEYS.checkins]: [],
    [KEYS.standaloneCardio]: [],
    [KEYS.settings]: { programStart: START, soundEnabled: false, lastBackup: addDays(today, -2) },
    [KEYS.customFoods]: [],
    [KEYS.entries]: [],
    [KEYS.targets]: [{ from: START, kcal: 2100, protein: 170, carbs: 200, fat: 65 }],
    [KEYS.favorites]: [],
    [KEYS.days]: days,
    [KEYS.creatine]: [],
    [KEYS.quarantine]: [],
    [MARKER]: { at: `${START}T06:00:00.000Z`, keys: Object.keys(KEYS) },
  };
  if (o.profile) data[PROFILE] = o.profile;
  return data;
}

/** רץ בתוך הדפדפן: כותב את כל המפתחות ל-IndexedDB של idb-keyval. */
export function seedInBrowser(data) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keyval-store');
    req.onupgradeneeded = () => req.result.createObjectStore('keyval');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      const st = tx.objectStore('keyval');
      st.clear();
      for (const [k, v] of Object.entries(data)) st.put(v, k);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** רץ בתוך הדפדפן: מנקה את ה-IndexedDB ואת localStorage. */
export function wipeInBrowser() {
  return new Promise((resolve) => {
    try {
      localStorage.clear();
    } catch {}
    const req = indexedDB.deleteDatabase('keyval-store');
    req.onsuccess = req.onerror = req.onblocked = () => resolve(true);
  });
}
