// ENTRY POINT: index.html loads this file, and this file boots React.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Global stylesheet, imported here so it applies to the whole document once.
import './index.css';

import App from './App.jsx';

// Grabs the empty <div id="root"> from index.html and hands it over to React.
createRoot(document.getElementById('root')).render(
  // StrictMode is a dev-only helper that double-renders to surface bugs early.
  <StrictMode>
    {/* BrowserRouter supplies the routing context (current URL, navigate, etc). */}
    {/* REQUIRED: a NavLink/Link/Routes with no Router above it throws on render. */}
    {/* A throw during render kills the whole tree, which is a blank white page. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
