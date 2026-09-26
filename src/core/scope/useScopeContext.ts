import { useParams } from 'react-router-dom'
import { createScopeContext, type ScopeContext } from '@shared/types/scope'

/** Derives GLOBAL vs PROJECT scope from the current route. */
export function useScopeContext(): ScopeContext {
  const { projectId } = useParams<{ projectId: string }>()
  return createScopeContext(projectId)
}
