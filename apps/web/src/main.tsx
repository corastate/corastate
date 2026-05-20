import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
