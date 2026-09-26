import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Clipboard, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeAgentResponseText } from '@shared/lib/agent-response'
import { cn } from '@/shared/lib/utils'

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (node && typeof node === 'object' && 'props' in node) return nodeText((node as { props: { children?: ReactNode } }).props.children)
  return ''
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const text = nodeText(children).replace(/\n$/, '')
  return (
    <div className="agent-code-block group/code">
      <div className="agent-code-toolbar">
        <span>Code</span>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1400) }}>
          {copied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

export function AgentResponseMessage({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const reduceMotion = useReducedMotion()
  const normalized = normalizeAgentResponseText(text)
  return (
    <motion.article
      className="agent-response-message"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="agent-response-avatar"><Sparkles className={cn('h-3.5 w-3.5', streaming && 'animate-pulse')} /></div>
      <div className="markdown-body min-w-0 flex-1 text-[11px] leading-[1.5]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>{normalized}</ReactMarkdown>
        <AnimatePresence>{streaming ? <motion.span className="agent-stream-caret" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} exit={{ opacity: 0 }} transition={{ repeat: Infinity, duration: 0.9 }} /> : null}</AnimatePresence>
      </div>
    </motion.article>
  )
}
