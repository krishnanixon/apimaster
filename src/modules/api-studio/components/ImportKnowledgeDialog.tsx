import { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { useProjectStore } from '@/shared/stores/project.store'
import { ExpandableField } from './ExpandableField'
import type { Project } from '@shared/types'

interface ImportKnowledgeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportKnowledgeDialog({ open, onOpenChange }: ImportKnowledgeDialogProps) {
  const importFromKnowledge = useApiStudioStore((s) => s.importFromKnowledge)
  const { projects, loadProjects } = useProjectStore()
  const [projectId, setProjectId] = useState('')
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) void loadProjects()
  }, [open, loadProjects])

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id)
  }, [projects, projectId])

  async function handleImport() {
    if (!projectId) return
    setLoading(true)
    try {
      await importFromKnowledge(projectId, baseUrl.trim() || undefined)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4" /> Import from Knowledge
          </DialogTitle>
          <DialogDescription>
            Create an API collection from API endpoints defined in a project&apos;s knowledge base.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Project</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((p: Project) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Base URL (optional)</span>
            <ExpandableField
              value={baseUrl}
              onChange={setBaseUrl}
              placeholder="https://api.example.com"
              mono
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleImport()} disabled={loading || !projectId}>
            {loading ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
