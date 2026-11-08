import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { migrateLocalStorage } from './lib/migrate.js'

migrateLocalStorage()
  .catch((e) => console.error('Migration failed (continuing):', e))
  .finally(() => {
    createRoot(document.getElementById('root')).render(
      <React.StrictMode><App /></React.StrictMode>
    )
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW registration failed:', e));
      });
    }
  })