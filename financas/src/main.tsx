import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Funciona offline e pode ser instalada como app (PWA)
// (só quando a app é a página principal; dentro de uma moldura/iframe não se aplica)
if ('serviceWorker' in navigator && import.meta.env.PROD && window.top === window) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sem service worker: a app funciona na mesma */ });
  });
}
