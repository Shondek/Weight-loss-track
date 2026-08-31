import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ה-service worker נוצר רק בבנייה (scripts/sw-plugin.ts).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
      .catch(() => undefined);
  });
}
