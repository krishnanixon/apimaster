import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getModuleWindowProfile, splitRoute } from '@shared/lib/module-windows'
import { PRODUCT_NAME } from '@shared/constants/product'
import { resolvePreferredColorMode } from '@/shared/lib/boot-theme'
import './styles/globals.css'

const rootEl = document.getElementById('root')!

function getHashPath(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

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
  rootEl.innerHTML = `<div class="boot-screen" role="status" aria-live="polite" aria-busy="true"><div class="boot-brand"><img class="boot-logo" src="./tess.png" alt="${PRODUCT_NAME}" width="48" height="48" /><p class="boot-title">${PRODUCT_NAME}</p></div><div class="boot-progress" aria-hidden="true"></div><p class="boot-message">${message}</p></div>`
}

function resolveBootMessage(hash: string): string {
  const { pathname, search } = splitRoute(hash)
  if (pathname === '/clipboard-picker') return 'Loading clipboard…'
  if (pathname === '/note-popup') return 'Loading note…'
  const profile = getModuleWindowProfile(`${pathname}${search ? `?${search}` : ''}`)
  if (profile) return `Opening ${profile.label}…`
  if (pathname.startsWith('/project/')) return 'Opening project…'
  if (search.includes('window=module') || search.includes('window=project')) {
    return 'Opening window…'
  }
  return 'Loading workbench…'
}

function renderFatal(error: unknown): void {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  rootEl.innerHTML = `<div style="box-sizing:border-box;height:100vh;overflow:auto;padding:32px;background:#0a0a0a;color:#f5f5f5;font:13px/1.5 ui-sans-serif,system-ui,sans-serif"><h1 style="margin:0 0 12px;font-size:18px">${PRODUCT_NAME} failed to start</h1><pre style="white-space:pre-wrap;color:#fca5a5">${message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</pre></div>`
}

async function bootstrap(): Promise<void> {
  applyEarlyTheme()
  const hash = getHashPath()
  setBootMessage(resolveBootMessage(hash))

  // Popup windows must not load the full App (multi‑MB). That caused a blank
  // picker and made the desktop app appear hung.
  if (hash === '/clipboard-picker' || hash.startsWith('/clipboard-picker?')) {
    const { ClipboardQuickPickerPage } = await import(
      '@/modules/clipboard-manager/pages/ClipboardQuickPickerPage'
    )
    createRoot(rootEl).render(
      <StrictMode>
        <ClipboardQuickPickerPage />
      </StrictMode>
    )
    return
  }

  if (hash === '/note-popup' || hash.startsWith('/note-popup?')) {
    const { QuickNotePopupPage } = await import('@/modules/notepad/pages/QuickNotePopupPage')
    createRoot(rootEl).render(
      <StrictMode>
        <QuickNotePopupPage />
      </StrictMode>
    )
    return
  }

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
