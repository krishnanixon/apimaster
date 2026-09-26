import type { Editor } from '@tiptap/react'
import {
  findNextInEditor as findNextMatch,
  replaceInEditor as replaceMatch
} from '@/features/editor/lib/find-replace'

export function nextRequirementId(html: string): string {
  const matches = html.match(/\bREQ-(\d{1,4})\b/gi) ?? []
  const max = matches.reduce((highest, id) => {
    const n = parseInt(id.replace(/\D/g, ''), 10)
    return Number.isFinite(n) ? Math.max(highest, n) : highest
  }, 0)
  return `REQ-${String(max + 1).padStart(3, '0')}`
}

export function requirementSnippet(id: string): string {
  return `<h3>${id} — Requirement title</h3><p><strong>Statement:</strong> The system shall …</p><p><strong>Priority:</strong> Must &nbsp;|&nbsp; <strong>Source:</strong> …</p><p><strong>Acceptance criteria:</strong></p><ul><li><p>Given …</p></li><li><p>When …</p></li><li><p>Then …</p></li></ul>`
}

export function userStorySnippet(): string {
  return `<h3>US- — User story</h3><p>As a <strong>role</strong>, I want <strong>capability</strong>, so that <strong>benefit</strong>.</p><p><strong>Priority:</strong> Must &nbsp;|&nbsp; <strong>Estimate:</strong> —</p><p><strong>Acceptance criteria:</strong></p><ul><li><p>Given … When … Then …</p></li></ul>`
}

export function acceptanceCriteriaSnippet(): string {
  return `<p><strong>Acceptance criteria</strong></p><ul><li><p><strong>Given</strong> a precondition</p></li><li><p><strong>When</strong> the user takes an action</p></li><li><p><strong>Then</strong> the expected result occurs</p></li></ul>`
}

export function nfrTableSnippet(): string {
  return `<h3>Non-functional requirement</h3><table><tbody><tr><th>ID</th><th>Category</th><th>Metric</th><th>Target</th></tr><tr><td>NFR-001</td><td>Performance</td><td>p95 response time</td><td>&lt; 300 ms</td></tr><tr><td>NFR-002</td><td>Availability</td><td>Monthly uptime</td><td>99.9%</td></tr></tbody></table>`
}

export function riskTableSnippet(): string {
  return `<h3>Risk</h3><table><tbody><tr><th>ID</th><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr><tr><td>RISK-001</td><td>Describe the risk</td><td>Medium</td><td>High</td><td>Mitigation plan</td></tr></tbody></table>`
}

export function noteCalloutSnippet(): string {
  return `<blockquote><p><strong>Note:</strong> Capture an assumption, constraint, or open question here.</p></blockquote>`
}

export function assumptionTableSnippet(): string {
  return `<h3>Assumptions</h3><table><tbody><tr><th>ID</th><th>Assumption</th><th>Impact if false</th><th>Owner</th></tr><tr><td>ASM-001</td><td>Describe the assumption</td><td>High / Medium / Low</td><td>—</td></tr></tbody></table>`
}

export function decisionLogSnippet(): string {
  return `<h3>Decision</h3><table><tbody><tr><th>ID</th><th>Decision</th><th>Options considered</th><th>Rationale</th><th>Date</th></tr><tr><td>DEC-001</td><td>What was decided</td><td>Option A / Option B</td><td>Why this option</td><td>—</td></tr></tbody></table>`
}

export function glossarySnippet(): string {
  return `<h3>Glossary</h3><table><tbody><tr><th>Term</th><th>Definition</th></tr><tr><td>Term</td><td>Plain-language definition used in this document</td></tr></tbody></table>`
}

export function changeLogSnippet(): string {
  return `<h3>Change log</h3><table><tbody><tr><th>Version</th><th>Date</th><th>Author</th><th>Summary</th></tr><tr><td>0.1</td><td>—</td><td>—</td><td>Initial draft</td></tr></tbody></table>`
}

export function openQuestionsSnippet(): string {
  return `<h3>Open questions</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Question to resolve — owner: —</p></li><li data-type="taskItem" data-checked="false"><p>Question to resolve — owner: —</p></li></ul>`
}

export function tocSnippet(headings: string[]): string {
  if (headings.length === 0) {
    return `<h2>Table of contents</h2><p>Add headings, then insert the table of contents again.</p>`
  }
  const items = headings.map((text) => `<li><p>${text}</p></li>`).join('')
  return `<h2>Table of contents</h2><ol>${items}</ol>`
}

export function missingSectionSnippet(title: string): string {
  return `<h2>${title}</h2><p></p>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function coverHeaderSnippet(opts: {
  title?: string
  projectName?: string
  typeLabel?: string
  status?: string
}): string {
  const date = new Date().toLocaleDateString()
  return `<div class="doc-header-block"><p class="doc-meta"><strong>Project:</strong> ${escapeHtml(opts.projectName || '[Project name]')}</p><p class="doc-meta"><strong>Document:</strong> ${escapeHtml(opts.title || '[Title]')}</p><p class="doc-meta"><strong>Type:</strong> ${escapeHtml(opts.typeLabel || 'Requirements')}</p><p class="doc-meta"><strong>Version:</strong> 1.0 &nbsp;|&nbsp; <strong>Date:</strong> ${date}</p><p class="doc-meta"><strong>Status:</strong> ${escapeHtml(opts.status || 'Draft')}</p></div>`
}

export function documentControlSnippet(): string {
  const date = new Date().toLocaleDateString()
  return `<h2>Document control</h2><table><tbody><tr><th>Field</th><th>Value</th></tr><tr><td>Author</td><td>[Author]</td></tr><tr><td>Reviewer</td><td>[Reviewer]</td></tr><tr><td>Approver</td><td>[Approver]</td></tr><tr><td>Last updated</td><td>${date}</td></tr></tbody></table>`
}

export function approvalTableSnippet(): string {
  return `<h2>Approval</h2><table><tbody><tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr><tr><td>Business owner</td><td></td><td></td><td></td></tr><tr><td>Technical lead</td><td></td><td></td><td></td></tr><tr><td>QA lead</td><td></td><td></td><td></td></tr></tbody></table>`
}

export function pageBreakSnippet(): string {
  return `<div data-type="page-break" data-page-break="true"></div>`
}

export function traceabilitySnippet(): string {
  return `<h3>Traceability</h3><table><tbody><tr><th>Req ID</th><th>Source</th><th>Design</th><th>Test</th></tr><tr><td>REQ-001</td><td></td><td></td><td></td></tr></tbody></table>`
}

export function insertHtml(editor: Editor, html: string): void {
  editor.chain().focus().insertContent(html).run()
}

export function navigateToHeading(editor: Editor, text: string, occurrence = 0): boolean {
  const target = text.trim().toLowerCase()
  let seen = 0
  let found = false
  editor.state.doc.descendants((node, pos) => {
    if (found) return false
    if (node.type.name === 'heading' && node.textContent.trim().toLowerCase() === target) {
      if (seen === occurrence) {
        editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
        found = true
        return false
      }
      seen += 1
    }
    return true
  })
  return found
}

export function findNextInEditor(editor: Editor, query: string): boolean {
  return findNextMatch(editor, query)
}

export function replaceInEditor(editor: Editor, query: string, replacement: string, all: boolean): number {
  return replaceMatch(editor, query, replacement, all)
}

const PLACEHOLDER_RE = /\b(TBD|TODO|FIXME|WIP)\b|\[[^\]]{2,80}\]|_{3,}/i

export function findNextPlaceholder(editor: Editor): boolean {
  const cursor = editor.state.selection.to
  let first: { from: number; to: number } | null = null
  let next: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const re = new RegExp(PLACEHOLDER_RE.source, 'gi')
    let match: RegExpExecArray | null
    while ((match = re.exec(node.text))) {
      const range = { from: pos + match.index, to: pos + match.index + match[0].length }
      if (!first) first = range
      if (range.from >= cursor && !next) next = range
    }
  })
  const target = next ?? first
  if (!target) return false
  editor.chain().focus().setTextSelection(target).scrollIntoView().run()
  return true
}

export function numberHeadings(editor: Editor): number {
  let h2 = 0
  let h3 = 0
  const updates: { from: number; to: number; text: string }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = node.attrs.level as number
    if (level !== 2 && level !== 3) return
    const stripped = node.textContent.replace(/^\d+(?:\.\d+)*\.?\s+/, '')
    if (level === 2) {
      h2 += 1
      h3 = 0
    } else {
      h3 += 1
    }
    const prefix = level === 2 ? `${h2}. ` : `${h2}.${h3} `
    const next = `${prefix}${stripped}`
    if (next === node.textContent) return
    updates.push({ from: pos + 1, to: pos + node.nodeSize - 1, text: next })
  })
  if (updates.length === 0) return 0
  let tr = editor.state.tr
  for (let i = updates.length - 1; i >= 0; i--) {
    tr = tr.insertText(updates[i].text, updates[i].from, updates[i].to)
  }
  editor.view.dispatch(tr)
  return updates.length
}
