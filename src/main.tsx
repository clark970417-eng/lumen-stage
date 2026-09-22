import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './guide.css'
import './responsive.css'
import Root from './Root'
import { startErrorMonitoring } from './monitoring'
import { registerPwa } from './pwa'

startErrorMonitoring()
registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
