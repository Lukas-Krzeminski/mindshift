import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/unbounded/400.css'
import '@fontsource/unbounded/600.css'
import '@fontsource/unbounded/700.css'
import '@fontsource-variable/inter'
import './styles.css'
import { bootstrap } from './game/bootstrap'
import { App } from './App'

bootstrap()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
