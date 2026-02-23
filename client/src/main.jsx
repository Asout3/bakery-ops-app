import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()

    if (import.meta.env.DEV) {
      await Promise.all(registrations.map((registration) => registration.unregister()))
      navigator.serviceWorker.register(`/sw.js?dev=${Date.now()}`).catch((error) => {
        console.error('Dev service worker registration failed:', error)
      })
      return
    }

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}
