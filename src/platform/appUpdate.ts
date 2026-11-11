/**
 * זיהוי גרסה חדשה. נוגע ב-navigator, ולכן מחוץ ל-src/lib.
 *
 * ה-service worker קורא skipWaiting ומשתלט מיד, אבל הקוד שכבר רץ בדף
 * נשאר הישן. ב-PWA שמותקן במסך הבית הדף כמעט אף פעם לא נסגר, ולכן בלי
 * הודעה מפורשת המשתמש יכול להישאר על גרסה ישנה לזמן בלתי מוגבל.
 *
 * מתי בודקים (שלב 7): הדפדפן בודק את sw.js רק בניווט — כלומר בפתיחה מלאה.
 * PWA שחוזר מהרקע לא מנווט, ולכן הבדיקה לא רצה וההודעה לא הופיעה עד
 * שסוגרים את האפליקציה לגמרי. עכשיו מבקשים בדיקה (`registration.update()`)
 * בכל חזרה למסך — לא יותר מפעם בדקה, ורק כשיש רשת. מה שקורה אחרי הבדיקה
 * לא השתנה: ה-service worker החדש מותקן, משתלט, והדף מציג "גרסה חדשה".
 * שם ה-cache, רשימת ה-precache וה-service worker עצמו — בלי שינוי.
 */

type Listener = () => void;

let updated = false;
const listeners = new Set<Listener>();

export function onAppUpdate(fn: Listener): () => void {
  listeners.add(fn);
  if (updated) fn();
  return () => listeners.delete(fn);
}

function markUpdated(): void {
  if (updated) return;
  updated = true;
  for (const fn of listeners) fn();
}

/** לא בודקים יותר מפעם בדקה: חזרה למסך מפעילה כמה אירועים ברצף. */
export const UPDATE_CHECK_MIN_MS = 60_000;

export type UpdateCheckDeps = {
  /** מבקש מהדפדפן לבדוק את sw.js (`registration.update()`). */
  update: () => Promise<unknown>;
  now: () => number;
  isVisible: () => boolean;
  isOnline: () => boolean;
  minIntervalMs?: number;
  /** מתי נבדק לאחרונה. ברירת המחדל: עכשיו — `register()` עצמו כבר בודק. */
  lastCheckAt?: number;
};

/**
 * הלוגיקה של "מתי לבדוק", בלי DOM: מחזיר פונקציה שקוראים לה בכל אירוע של
 * חזרה למסך. בודקת רק כשהדף גלוי, יש רשת, ועברה דקה מהבדיקה הקודמת.
 * מחזירה true אם נשלחה בדיקה. כישלון של הבדיקה נבלע — ננסה בחזרה הבאה.
 */
export function createUpdateCheck(deps: UpdateCheckDeps): () => boolean {
  const min = deps.minIntervalMs ?? UPDATE_CHECK_MIN_MS;
  let last = deps.lastCheckAt ?? deps.now();
  return () => {
    if (!deps.isVisible() || !deps.isOnline()) return false;
    const now = deps.now();
    if (now - last < min) return false;
    last = now;
    void deps.update().catch(() => undefined);
    return true;
  };
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // אם כבר יש controller, כל החלפה שלו היא עדכון ולא התקנה ראשונה.
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    markUpdated();
  });

  void navigator.serviceWorker
    .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
    .then((registration) => {
      // גיבוי ל-controllerchange: גם כשה-worker החדש מגיע ל"activated" מסמנים
      // עדכון. יש דפדפנים שבהם האירוע הראשון לא מגיע לדף שחזר מהרקע.
      const watch = (worker: ServiceWorker | null) => {
        if (!worker || !hadController) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') markUpdated();
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));

      // חזרה מהרקע: מבקשים מהדפדפן לבדוק אם יש sw.js חדש.
      const check = createUpdateCheck({
        update: () => registration.update(),
        now: () => Date.now(),
        isVisible: () => document.visibilityState === 'visible',
        isOnline: () => navigator.onLine !== false,
      });
      document.addEventListener('visibilitychange', check);
      window.addEventListener('pageshow', check);
      window.addEventListener('focus', check);
      window.addEventListener('online', check);
    })
    .catch(() => undefined);
}
