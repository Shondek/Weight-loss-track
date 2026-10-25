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

// ה-service worker נוצר רק בבנייה (scripts/sw-plugin.ts).
if (import.meta.env.PROD) {
  window.addEventListener('load', registerServiceWorker);
}
