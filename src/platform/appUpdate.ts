/**
 * זיהוי גרסה חדשה. נוגע ב-navigator, ולכן מחוץ ל-src/lib.
 *
 * ה-service worker קורא skipWaiting ומשתלט מיד, אבל הקוד שכבר רץ בדף
 * נשאר הישן. ב-PWA שמותקן במסך הבית הדף כמעט אף פעם לא נסגר, ולכן בלי
 * הודעה מפורשת המשתמש יכול להישאר על גרסה ישנה לזמן בלתי מוגבל.
 */

type Listener = () => void;

let updated = false;
const listeners = new Set<Listener>();

export function onAppUpdate(fn: Listener): () => void {
  listeners.add(fn);
  if (updated) fn();
  return () => listeners.delete(fn);
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // אם כבר יש controller, כל החלפה שלו היא עדכון ולא התקנה ראשונה.
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    updated = true;
    for (const fn of listeners) fn();
  });

  void navigator.serviceWorker
    .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
    .catch(() => undefined);
}
