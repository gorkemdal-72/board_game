import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // React.StrictMode, development modunda componentleri iki kez render eder (test amaçlı)
  // Socket bağlantısı çift olmasın diye şimdilik kapalı tutabiliriz veya açık kalsın fark etmez.
  <App />
)