import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './widescreen.css'
import './guide.css'
import Root from './Root'
import { startErrorMonitoring } from './monitoring'

startErrorMonitoring()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
