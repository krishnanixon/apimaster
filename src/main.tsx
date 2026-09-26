import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PRODUCT_NAME } from '@shared/constants/product'
import { resolvePreferredColorMode } from '@/shared/lib/boot-theme'
import './styles/globals.css'

const rootEl = document.getElementById('root')!

function applyEarlyTheme(): void {
  document.documentElement.classList.toggle('dark', resolvePreferredColorMode() === 'dark')
  if (/Mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent)) {
    document.documentElement.dataset.platform = 'mac'
  }
}

function setBootMessage(message: string): void {
  const el = document.getElementById('boot-message')
  if (el) {
    el.textContent = message
    return
  }
  rootEl.innerHTML = `<div class="boot-screen" role="status" aria-live="polite" aria-busy="true"><div class="boot-brand"><img class="boot-logo" src="./apimaster.png" alt="${PRODUCT_NAME}" width="48" height="48" /><p class="boot-title">${PRODUCT_NAME}</p></div><div class="boot-progress" aria-hidden="true"></div><p class="boot-message">${message}</p></div>`
}

function renderFatal(error: unknown): void {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  rootEl.innerHTML = `<div style="box-sizing:border-box;height:100vh;overflow:auto;padding:32px;background:#0a0a0a;color:#f5f5f5;font:13px/1.5 ui-sans-serif,system-ui,sans-serif"><h1 style="margin:0 0 12px;font-size:18px">${PRODUCT_NAME} failed to start</h1><pre style="white-space:pre-wrap;color:#fca5a5">${message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</pre></div>`
}

async function bootstrap(): Promise<void> {
  applyEarlyTheme()
  setBootMessage(`Loading ${PRODUCT_NAME}…`)

  const [{ HashRouter }, { App }] = await Promise.all([
    import('react-router-dom'),
    import('./app/App')
  ])

  createRoot(rootEl).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  )
}

void bootstrap().catch((error) => {
  console.error(error)
  renderFatal(error)
})
