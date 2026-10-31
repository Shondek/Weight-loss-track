/**
 * נתוני דמה למסך "היום" — נכתבים ישירות ל-IndexedDB (`keyval-store`/`keyval`)
 * דרך Playwright. אותם 13 מפתחות של האפליקציה + סמן המיגרציה. כלי עבודה
 * לצילומים ולבדיקת השוויון בלבד; לא נכנס ל-build.
 *
 * תרחיש = היום (ISO) + אילו ימים נשקלו השבוע + מדידות מותניים נוספות.
 * השקילות ההיסטוריות זהות בכל התרחישים: ירידה איטית מ-06/09/2026, שבוע
 * אחד חלקי באמצע, כך שלגרף יש ≥3 שבועות מלאים.
 */

const START = '2026-09-06'; // ראשון, שבוע 1
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

/**
 * @param {object} o
 * @param {string} o.today  התאריך של התרחיש
 * @param {string[]} [o.skipDays]  ימים (מכל שבוע) שלא נשקלו בהם
 * @param {boolean} [o.weighToday]  האם יש שקילה היום (ברירת מחדל: לא)
 * @param {string[]} [o.extraWaist]  מדידות מותניים נוספות מעבר לרביעים ההיסטוריים: "YYYY-MM-DD:cm"
 * @param {boolean} [o.closedToday]
 * @param {'partner'|null} [o.profile]
 */
export function buildSeed(o) {
  const today = o.today;
  const skip = new Set(o.skipDays ?? []);
  const weights = [];
  // שבוע חלקי היסטורי קבוע: 04/10–10/10 חסרים שני ימים.
  skip.add('2026-10-06');
  skip.add('2026-10-08');
  for (let d = START; d < today; d = addDays(d, 1)) if (!skip.has(d)) weights.push({ d, w: weightOn(d) });
  if (o.weighToday) weights.push({ d: today, w: weightOn(today) });

  // מותניים: כל רביעי עד השבוע שלפני השבוע של היום.
  const waist = [];
  const thisWeekStart = addDays(today, -fromISO(today).getDay());
  let cm = 99.0;
  for (let d = '2026-09-09'; d < thisWeekStart; d = addDays(d, 7)) {
    waist.push({ d, cm: Math.round(cm * 2) / 2 });
    cm -= 0.35;
  }
  for (const s of o.extraWaist ?? []) {
    const [d, v] = s.split(':');
    waist.push({ d, cm: Number(v) });
  }

  // אימונים A→B→C, שלושה בשבוע (ב', ד', ו'), עד היום. ex ריק — מספיק לסבב.
  const workouts = [];
  const types = ['A', 'B', 'C'];
  let t = 0;
  for (let d = '2026-09-07'; d < today; d = addDays(d, 1)) {
    const dow = fromISO(d).getDay();
    if (dow === 1 || dow === 3 || dow === 5) {
      workouts.push({ schemaVersion: 2, id: `w-${d}`, d, t: types[t % 3], ex: [], knee: null, shoulder: null });
      t++;
    }
  }

  // ימים: 14 הימים שלפני היום סגורים עם צעדים; היום פתוח (או סגור לפי התרחיש).
  const days = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(today, -i);
    days.push({ d, closed: true, closedAt: `${d}T21:30:00.000Z`, steps: 7200 + (i % 5) * 600 });
  }
  if (o.closedToday) days.push({ d: today, closed: true, closedAt: `${today}T20:10:00.000Z` });

  // אכילה היום: שני רישומים, 55 ג' חלבון בסך הכול. ה-ref קובע (snapshot).
  const noon = fromISO(today).getTime();
  const entries = [
    {
      id: `${noon - 4 * 3600000}-a`,
      d: today,
      ts: noon - 4 * 3600000,
      meal: 'breakfast',
      foodId: '10000001',
      grams: 200,
      ref: { name: 'קוטג׳ 5%', kcal: 98, protein: 11, carbs: 3, fat: 5, fiber: 0 },
    },
    {
      id: `${noon + 1 * 3600000}-b`,
      d: today,
      ts: noon + 1 * 3600000,
      meal: 'lunch',
      foodId: '10000002',
      grams: 150,
      ref: { name: 'חזה עוף צלוי', kcal: 165, protein: 22, carbs: 0, fat: 3.6, fiber: 0 },
    },
  ];

  const data = {
    [KEYS.weights]: weights,
    [KEYS.workouts]: workouts,
    [KEYS.waist]: waist,
    [KEYS.checkins]: [],
    [KEYS.standaloneCardio]: [],
    [KEYS.settings]: { programStart: START, soundEnabled: true, lastBackup: addDays(today, -2) },
    [KEYS.customFoods]: [],
    [KEYS.entries]: entries,
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
