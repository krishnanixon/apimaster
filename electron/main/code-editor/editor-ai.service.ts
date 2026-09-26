import { aiRouter } from '../ai/router/router'
import {
  buildCompletionMessages,
  buildInlineAskMessages,
  buildInlineEditMessages,
  buildNextEditMessages,
  languageFromPath
} from '@shared/lib/editor-ai'
import type { EditorAiRequest } from '@shared/types/code-editor'
import type { AIChatMessage } from '../ai/types'

export async function* streamEditorAi(
  request: EditorAiRequest,
  signal: AbortSignal
): AsyncGenerator<string> {
  const language = request.language || (request.filePath ? languageFromPath(request.filePath) : '')
  const messages: AIChatMessage[] =
    request.kind === 'completion'
      ? buildCompletionMessages({
          filePath: request.filePath,
          language,
          prefix: request.prefix,
          suffix: request.suffix
        })
      : request.kind === 'next-edit'
        ? buildNextEditMessages({
            filePath: request.filePath,
            language,
            prefix: request.prefix,
            suffix: request.suffix,
            recentEdit: request.selection ?? ''
          })
        : request.kind === 'inline-ask'
          ? buildInlineAskMessages({
              instruction: request.instruction?.trim() || 'Explain this code.',
              filePath: request.filePath,
              language,
              prefix: request.prefix,
              suffix: request.suffix,
              selection: request.selection ?? ''
            })
          : buildInlineEditMessages({
              instruction: request.instruction?.trim() || 'Improve this code.',
              filePath: request.filePath,
              language,
              prefix: request.prefix,
              suffix: request.suffix,
              selection: request.selection ?? ''
            })

  const maxTokens =
    request.kind === 'completion' || request.kind === 'next-edit'
      ? 160
      : request.kind === 'inline-ask'
        ? 1_500
        : 4_096
  yield* aiRouter.streamChat(messages, {
    model: request.model,
    temperature:
      request.kind === 'completion' || request.kind === 'next-edit'
        ? 0.15
        : request.kind === 'inline-ask'
          ? 0.3
          : 0.2,
    maxTokens,
    signal,
    requestType: 'CODE_GENERATION',
    meta: {
      feature:
        request.kind === 'completion'
          ? 'tab-complete'
          : request.kind === 'next-edit'
            ? 'next-edit'
            : request.kind === 'inline-ask'
              ? 'inline-ask'
              : 'inline-edit'
    }
  })
}
