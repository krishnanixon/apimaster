import { useEffect } from 'react'
import { useVaultStore } from '../stores/vault.store'

export function useVaultKeyboard(onNewCredential: () => void) {
  const { selectedItemId, copyField, lock, setSearchQuery, runSearch } = useVaultStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        const el = document.getElementById('vault-search-input') as HTMLInputElement | null
        el?.focus()
        return
      }

      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        onNewCredential()
        return
      }

      if (mod && e.key.toLowerCase() === 'c' && selectedItemId) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        void copyField('password')
      }

      if (mod && e.key === 'l') {
        e.preventDefault()
        void lock()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedItemId, copyField, lock, onNewCredential, setSearchQuery, runSearch])
}
