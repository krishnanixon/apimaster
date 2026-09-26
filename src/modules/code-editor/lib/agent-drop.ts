import type { DragEvent } from 'react'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { parseWorkbenchPath, WORKBENCH_PATH_MIME, fileNameOf } from '@shared/lib/workbench-dnd'
import type { AgentFileRef } from '@shared/types/agent'

export async function refsFromDropEvent(event: DragEvent): Promise<AgentFileRef[]> {
  const refs: AgentFileRef[] = []
  const internal = parseWorkbenchPath(event.dataTransfer.getData(WORKBENCH_PATH_MIME))
  if (internal) {
    refs.push({
      path: internal.path,
      name: internal.name,
      kind: internal.isDirectory ? 'folder' : 'file'
    })
  }

  const api = await waitForDesktopApi()
  const files = Array.from(event.dataTransfer.files ?? [])
  for (const file of files) {
    const path = api?.app?.getPathForFile?.(file)?.trim()
    if (!path) continue
    const inspected = api?.codeEditor?.inspectPath
      ? await api.codeEditor.inspectPath(path)
      : null
    if (inspected?.success && inspected.data) {
      refs.push({
        path: inspected.data.path,
        name: inspected.data.name,
        kind: inspected.data.isDirectory ? 'folder' : 'file'
      })
      continue
    }
    refs.push({
      path,
      name: fileNameOf(path) || file.name,
      kind: 'file'
    })
  }

  const unique = new Map<string, AgentFileRef>()
  for (const ref of refs) unique.set(ref.path, ref)
  return [...unique.values()]
}

export function pathsFromDropEventSync(event: DragEvent): string[] {
  const internal = parseWorkbenchPath(event.dataTransfer.getData(WORKBENCH_PATH_MIME))
  const paths: string[] = []
  if (internal) paths.push(internal.path)
  return paths
}
