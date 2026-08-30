import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PhotoAnalyzer from './components/PhotoAnalyzer'
import './responsive.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><PhotoAnalyzer /></StrictMode>
)
