import { useState, useCallback, useEffect } from 'react'
import { ChevronRight, Folder, File, ArrowUp, Save, RefreshCw, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import * as fileService from '../services/file.service'
import type { FileEntry } from '@shared/types/vps'

interface FileManagerProps {
  serverId: string
  os?: 'linux' | 'windows'
  disabled?: boolean
}

export function FileManager({ serverId, disabled, os = 'linux' }: FileManagerProps) {
  const root = os === 'windows' ? 'C:/' : '/'
  const [currentPath, setCurrentPath] = useState(root)
  const [pathInput, setPathInput] = useState(root)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [dirty, setDirty] = useState(false)

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true)
      try {
        const items = await fileService.listDirectory(serverId, path)
        setEntries(items)
        setCurrentPath(path)
        setPathInput(path)
        setSelectedFile(null)
        setFileContent('')
        setDirty(false)
      } catch (e) {
        setEntries([])
        toast.error(e instanceof Error ? e.message : 'Failed to list directory')
      } finally {
        setLoading(false)
      }
    },
    [serverId]
  )

  useEffect(() => {
    if (!disabled) void loadDir(root)
  }, [loadDir, disabled, root])

  const openFile = async (path: string) => {
    setLoadingFile(true)
    try {
      const content = await fileService.readFile(serverId, path)
      setSelectedFile(path)
      setFileContent(content)
      setDirty(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to read file')
    } finally {
      setLoadingFile(false)
    }
  }

  const saveFile = async () => {
    if (!selectedFile) return
    setSaving(true)
    try {
      await fileService.writeFile(serverId, selectedFile, fileContent)
      setDirty(false)
      toast.success('File saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save file')
    } finally {
      setSaving(false)
    }
  }

  const goUp = () => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    void loadDir(
      os === 'windows'
        ? parts.length <= 1
          ? `${parts[0]}/`
          : parts.join('/')
        : '/' + parts.join('/')
    )
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12">
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title="File manager unavailable"
          description="Connect to this server to browse remote files."
        />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[400px] animate-fade-in flex-col gap-3 md:flex-row">
      <div className="flex max-h-64 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card md:max-h-none md:w-72">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (pathInput.trim()) void loadDir(pathInput.trim().replace(/\\/g, '/'))
            }}
          >
            <input
              aria-label="Remote directory path"
              className="w-full rounded border border-input bg-background px-2 py-1 font-mono text-xs"
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              disabled={loading}
            />
          </form>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={goUp}
              aria-label="Parent directory"
              disabled={currentPath === '/' || /^[A-Za-z]:\/$/.test(currentPath) || loading}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              aria-label="Refresh files"
              onClick={() => loadDir(currentPath)}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-1">
          {loading ? (
            <div className="space-y-1 p-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full rounded-md" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">Empty directory</li>
          ) : (
            entries.map((entry) => (
              <li key={entry.path}>
                <button
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                    selectedFile === entry.path && 'bg-accent font-medium'
                  )}
                  onClick={() =>
                    entry.type === 'directory' ? loadDir(entry.path) : openFile(entry.path)
                  }
                  disabled={loadingFile}
                >
                  {entry.type === 'directory' ? (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{entry.name}</span>
                  {entry.type === 'directory' && (
                    <ChevronRight className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {loadingFile ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <Spinner />
            <p className="text-xs text-muted-foreground">Loading file...</p>
          </div>
        ) : selectedFile ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="truncate font-mono text-xs" title={selectedFile}>
                {selectedFile}
                {dirty && <span className="ml-1 text-amber-500">•</span>}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={saveFile}
                disabled={!dirty || saving}
              >
                {saving ? (
                  <Spinner size="sm" className="mr-1" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <textarea
              className="flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed focus:outline-none"
              value={fileContent}
              onChange={(e) => {
                setFileContent(e.target.value)
                setDirty(true)
              }}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a file to view or edit
          </div>
        )}
      </div>
    </div>
  )
}
