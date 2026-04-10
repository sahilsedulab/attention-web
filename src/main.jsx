import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Pre-load COCO-SSD phone detector immediately on app boot.
// By the time the user opens the camera, the model is already warm.
import './hooks/usePhoneDetector.js'

createRoot(document.getElementById('root')).render(
  <App />
)
