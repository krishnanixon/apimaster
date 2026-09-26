import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useProjectStore } from '@/shared/stores/project.store'
import { useChatStore } from '@/features/chat/stores/chat.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useKnowledgeStore } from '@/features/knowledge/stores/knowledge.store'
import { Spinner } from '@/shared/components/ui/spinner'

/** Loads project data when entering project routes — layout handled by AppShell */
export function ProjectProvider() {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject, openProject } = useProjectStore()
  const { loadConversations, resetForProject } = useChatStore()
  const { loadDocuments } = useDocumentStore()
  const { loadKnowledge } = useKnowledgeStore()

  useEffect(() => {
    if (projectId) {
      resetForProject()
      openProject(projectId)
      loadConversations(projectId)
      loadDocuments(projectId)
      loadKnowledge(projectId)
    }
  }, [projectId, openProject, loadConversations, loadDocuments, loadKnowledge, resetForProject])

  if (projectId && !currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><Outlet /></div>
}
