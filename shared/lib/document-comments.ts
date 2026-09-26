import type { DocumentComment, DocumentCommentReply } from '@shared/types'

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parseReply(raw: unknown): DocumentCommentReply | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const body = asString(row.body)
  if (!id || !body.trim()) return null
  return {
    id,
    body,
    author: asString(row.author, 'You'),
    createdAt: asString(row.createdAt, new Date().toISOString())
  }
}

function parseComment(raw: unknown): DocumentComment | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const body = asString(row.body)
  if (!id || !body.trim()) return null
  const replies = Array.isArray(row.replies)
    ? row.replies.map(parseReply).filter((item): item is DocumentCommentReply => Boolean(item))
    : []
  return {
    id,
    body,
    author: asString(row.author, 'You'),
    createdAt: asString(row.createdAt, new Date().toISOString()),
    resolved: row.resolved === true,
    quote: asString(row.quote),
    replies
  }
}

export function parseComments(raw: unknown): DocumentComment[] {
  if (Array.isArray(raw)) {
    return raw.map(parseComment).filter((item): item is DocumentComment => Boolean(item))
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parseComments(parsed)
    } catch {
      return []
    }
  }
  return []
}

export function serializeComments(comments: DocumentComment[]): string {
  return JSON.stringify(comments)
}

export function createComment(input: {
  body: string
  quote?: string
  author?: string
}): DocumentComment {
  return {
    id: crypto.randomUUID(),
    body: input.body.trim(),
    author: input.author ?? 'You',
    createdAt: new Date().toISOString(),
    resolved: false,
    quote: (input.quote ?? '').trim(),
    replies: []
  }
}
