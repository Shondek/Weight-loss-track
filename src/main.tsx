import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { registerServiceWorker } from './platform/appUpdate';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ה-service worker נוצר רק בבנייה (scripts/sw-plugin.ts).
if (import.meta.env.PROD) {
  window.addEventListener('load', registerServiceWorker);
}
