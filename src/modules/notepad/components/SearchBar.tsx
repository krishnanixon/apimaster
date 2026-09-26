import { useEffect, useState, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { useNotepadStore } from '../stores/notepad.store'

export function SearchBar() {
  const { searchQuery, setSearchQuery, runSearch } = useNotepadStore()
  const [localQuery, setLocalQuery] = useState(searchQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localQuery)
      runSearch()
    }, 300)
    return () => clearTimeout(timer)
  }, [localQuery, setSearchQuery, runSearch])

  const clear = useCallback(() => {
    setLocalQuery('')
    setSearchQuery('')
    runSearch()
  }, [setSearchQuery, runSearch])

  return (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        placeholder="Search notes by title, content, or tags..."
        className="h-9 pl-9 pr-9"
      />
      {localQuery && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
