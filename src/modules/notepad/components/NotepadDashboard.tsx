import { useEffect, useCallback } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Plus, StickyNote } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { useNotepadStore } from '../stores/notepad.store'
import { NotesSidebar } from './NotesSidebar'
import { NoteEditor } from './NoteEditor'
import { TagPanel } from './TagPanel'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { SearchBar } from './SearchBar'

export function NotepadDashboard() {
  const { initialized, isLoading, init, selectedNoteId, createNote, isFullscreen } =
    useNotepadStore()

  useEffect(() => {
    void init()
  }, [init])

  const handleCreateNote = useCallback(async () => {
    await createNote()
  }, [createNote])

  if (!initialized && isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  const showMeta = !isFullscreen && !!selectedNoteId

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 bg-card/40 px-4 py-3 backdrop-blur-sm">
        <div className="relative min-w-0 max-w-xl flex-1">
          <SearchBar />
        </div>
        <Button size="sm" onClick={() => void handleCreateNote()} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          New Note
        </Button>
      </div>

      <Group
        key={showMeta ? 'three-col' : isFullscreen ? 'full' : 'two-col'}
        id="notepad-layout"
        orientation="horizontal"
        className="min-h-0 w-full flex-1"
        defaultLayout={
          showMeta
            ? { 'notepad-sidebar': 20, 'notepad-editor': 55, 'notepad-meta': 25 }
            : { 'notepad-sidebar': 24, 'notepad-editor': 76 }
        }
      >
        {!isFullscreen && (
          <>
            <Panel
              id="notepad-sidebar"
              defaultSize="20%"
              minSize="220px"
              maxSize="32%"
              className="min-w-0"
            >
              <div className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border/40 bg-muted/20">
                <NotesSidebar />
              </div>
            </Panel>

            <Separator className="w-1 shrink-0 bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50" />
          </>
        )}

        <Panel
          id="notepad-editor"
          defaultSize={showMeta ? '55%' : isFullscreen ? '100%' : '76%'}
          minSize="360px"
          className="min-w-0"
        >
          <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
            {selectedNoteId ? (
              <NoteEditor noteId={selectedNoteId} />
            ) : (
              <EmptyState
                icon={<StickyNote className="h-5 w-5" />}
                title="Select or create a note"
                description="Choose a note from the sidebar or create a new one to get started."
                action={
                  <Button onClick={() => void handleCreateNote()} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    New Note
                  </Button>
                }
              />
            )}
          </div>
        </Panel>

        {showMeta && (
          <>
            <Separator className="w-1 shrink-0 bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50" />

            <Panel
              id="notepad-meta"
              defaultSize="25%"
              minSize="240px"
              maxSize="36%"
              className="min-w-0"
            >
              <div className="flex h-full min-w-0 flex-col overflow-hidden border-l border-border/40 bg-card/30">
                <TagPanel noteId={selectedNoteId} />
                <VersionHistoryPanel noteId={selectedNoteId} />
              </div>
            </Panel>
          </>
        )}
      </Group>
    </div>
  )
}
