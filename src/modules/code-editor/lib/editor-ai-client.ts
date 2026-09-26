import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import type { EditorAiRequest } from '@shared/types/code-editor'
import { useAIStore } from '@/features/ai/stores/ai.store'

let seq = 0

export function nextEditorAiRequestId(kind: EditorAiRequest['kind']): string {
  seq += 1
  return `${kind}-${Date.now()}-${seq}`
}

export interface EditorAiStreamHandlers {
  onChunk: (delta: string) => void
  onEnd: () => void
  onError: (error: string) => void
}

/** Starts an editor AI stream and returns an abort function. */
export function streamEditorAi(
  input: Omit<EditorAiRequest, 'requestId' | 'model'> & { requestId?: string },
  handlers: EditorAiStreamHandlers
): () => void {
  const requestId = input.requestId ?? nextEditorAiRequestId(input.kind)
  const request: EditorAiRequest = {
    ...input,
    requestId,
    model: useAIStore.getState().activeModel ?? undefined
  }

  let aborted = false
  let dispose: (() => void) | null = null

  void waitForDesktopApi().then((api) => {
    if (aborted) return
    if (!api?.codeEditor?.ai?.stream) {
      handlers.onError('Editor AI is unavailable.')
      return
    }
    dispose = api.codeEditor.ai.stream(
      request,
      (chunk) => {
        if (!aborted && chunk.content) handlers.onChunk(chunk.content)
      },
      () => {
        if (!aborted) handlers.onEnd()
      },
      (_id, error) => {
        if (!aborted) handlers.onError(error)
      }
    )
  })

  return () => {
    aborted = true
    dispose?.()
    dispose = null
    void waitForDesktopApi().then((api) => {
      void api?.codeEditor?.ai?.abort?.(requestId)
    })
  }
}
