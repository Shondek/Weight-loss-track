import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { registerServiceWorker } from './platform/appUpdate';
import { loadProfile } from './platform/profile';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');

/**
 * פרופיל המכשיר נקבע לפני שהאפליקציה מיובאת: `data/program.ts` בוחר את
 * קובץ התוכנית בזמן טעינת המודול, ולכן App נטען בייבוא דינמי רק אחרי
 * שהפרופיל ידוע. בלי פרופיל (או כשהקריאה נכשלת) — ההתנהגות של היום.
 */
/**
 * דף הערכה (src/ui/Kit.tsx): פיתוח בלבד, ב-`#kit`. הענף כולו נמצא בתוך
 * `import.meta.env.DEV`, ולכן ה-bundler משמיט אותו ואת הרכיבים שרק הוא
 * משתמש בהם מ-build של הייצור.
 */
if (import.meta.env.DEV && window.location.hash === '#kit') {
  void import('./ui/Kit').then(({ default: Kit }) => {
    createRoot(el).render(
      <StrictMode>
        <div className="app">
          <main className="app__main">
            <Kit />
          </main>
        </div>
      </StrictMode>,
    );
  });
} else {
  void loadProfile()
    .catch(() => null)
    .then(() => import('./App'))
    .then(({ default: App }) => {
      createRoot(el).render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    });
}

// ה-service worker נוצר רק בבנייה (scripts/sw-plugin.ts).
if (import.meta.env.PROD) {
  window.addEventListener('load', registerServiceWorker);
}
