import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { resolveTerminalTheme } from '../theme/macTerminalTheme'
import { useTerminalStore } from '../stores/terminal.store'

interface XtermViewProps {
  tabId: string
  visible: boolean
  focused: boolean
  onFocus: () => void
}

export function XtermView({ tabId, visible, focused, onFocus }: XtermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const mountedRef = useRef(false)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const registerTerminal = useTerminalStore((s) => s.registerXterm)
  const unregisterTerminal = useTerminalStore((s) => s.unregisterXterm)

  const fit = useCallback(() => {
    const fitAddon = fitAddonRef.current
    const terminal = terminalRef.current
    if (!fitAddon || !terminal || !visibleRef.current) return
    try {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        void window.electronAPI.terminal.resize(tabId, dims.cols, dims.rows)
      }
    } catch {
      // ignore fit during hidden layout
    }
  }, [tabId])

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return
    mountedRef.current = true

    const terminal = new Terminal({
      theme: resolveTerminalTheme(),
      fontFamily: '"SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(containerRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    registerTerminal(tabId, terminal, fit)

    const dataDisposable = terminal.onData((data) => {
      void window.electronAPI.terminal.write(tabId, data)
    })

    const resizeObserver = new ResizeObserver(() => fit())
    resizeObserver.observe(containerRef.current)

    requestAnimationFrame(() => fit())

    return () => {
      dataDisposable.dispose()
      resizeObserver.disconnect()
      unregisterTerminal(tabId)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      mountedRef.current = false
    }
  }, [tabId, registerTerminal, unregisterTerminal, fit])

  useEffect(() => {
    const root = document.documentElement
    let frame: number | null = null
    const refreshTheme = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        if (terminalRef.current) terminalRef.current.options.theme = resolveTerminalTheme(root)
      })
    }
    const observer = new MutationObserver(refreshTheme)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-visual-theme', 'data-layout-style']
    })
    refreshTheme()

    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (focused) {
      requestAnimationFrame(() => {
        fit()
        terminalRef.current?.focus()
      })
    }
  }, [focused, fit])

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fit())
  }, [visible, fit])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-[var(--wb-editor)] px-1 py-1"
      style={{ display: visible ? 'block' : 'none' }}
      onMouseDown={onFocus}
    />
  )
}
