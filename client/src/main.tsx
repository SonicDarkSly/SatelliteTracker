import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable dans index.html');

// Note : StrictMode monte deux fois les effets en développement. Le globe Cesium
// est détruit puis recréé proprement par le nettoyage de son effet — c'est voulu.
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
