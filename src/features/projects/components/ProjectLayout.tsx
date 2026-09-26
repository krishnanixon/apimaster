import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, NavLink, Outlet } from 'react-router-dom'
import {
  MessageSquare,
  FileText,
  Settings,
  Sparkles,
  ArrowLeft,
  Search,
  Home
} from 'lucide-react'
import { useProjectStore } from '@/shared/stores/project.store'
import { useChatStore } from '@/features/chat/stores/chat.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import type { SearchResult } from '@shared/types'

const navItems = [
  { to: 'chat', icon: MessageSquare, label: 'AI Chat' },
  { to: 'documents', icon: FileText, label: 'Documents' },
  { to: 'generate', icon: Sparkles, label: 'Generate' },
  { to: 'settings', icon: Settings, label: 'Settings' }
]

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject, openProject } = useProjectStore()
  const { loadConversations } = useChatStore()
  const { loadDocuments } = useDocumentStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (projectId) {
      openProject(projectId)
      loadConversations(projectId)
      loadDocuments(projectId)
    }
  }, [projectId, openProject, loadConversations, loadDocuments])

  useEffect(() => {
    if (!projectId || !searchQuery.trim()) {
      setSearchResults([])
      return
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true)
      const result = await window.electronAPI.search.global(projectId, searchQuery)
      if (result.success && result.data) {
        setSearchResults(result.data)
      }
      setIsSearching(false)
    }, 300)

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [searchQuery, projectId])

  if (!currentProject && projectId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-border p-4">
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 w-full justify-start gap-2"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
            All Projects
          </Button>
          <h2 className="truncate text-sm font-semibold">{currentProject?.name}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {currentProject?.description || 'No description'}
          </p>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-8 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search project"
            />
          </div>
          {searchQuery && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-background">
              {isSearching ? (
                <div className="flex justify-center p-3">
                  <Spinner size="sm" />
                </div>
              ) : searchResults.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No results found</p>
              ) : (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-accent"
                    onClick={() => {
                      if (result.entityType === 'document') {
                        navigate(`/project/${projectId}/editor/${result.entityId}`)
                      } else {
                        navigate(`/project/${projectId}/chat`)
                      }
                      setSearchQuery('')
                    }}
                  >
                    <span className="font-medium">{result.title}</span>
                    <span className="ml-1 text-muted-foreground">({result.entityType})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={`/project/${projectId}/${to}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => navigate('/dashboard')}
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
