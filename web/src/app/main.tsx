import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConsolePage } from '../pages/console/ConsolePage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <ConsolePage />
  </StrictMode>,
);
