import { hoverTooltip, type Tooltip } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { getDesktopApi } from '@/shared/lib/desktop-api'
import { identifierRangeAt } from './navigation'
import { isTsLikePath } from './language-files'

function tooltipDom(title: string, body: string, hint: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'cm-tooltip-hover px-2 py-1.5 text-[12px] leading-snug'
  const heading = document.createElement('div')
  heading.className = 'font-medium font-mono whitespace-pre-wrap'
  heading.textContent = title
  const detail = document.createElement('div')
  detail.className = 'mt-0.5 opacity-80 whitespace-pre-wrap'
  detail.textContent = body
  const foot = document.createElement('div')
  foot.className = 'mt-1 opacity-60 text-[10px]'
  foot.textContent = hint
  root.append(heading)
  if (body) root.append(detail)
  root.append(foot)
  return root
}

/** Hover cards from the TypeScript language service, falling back to the workspace index. */
export function symbolHover(filePath: string): Extension {
  return hoverTooltip(
    async (view, pos): Promise<Tooltip | null> => {
      const range = identifierRangeAt(view.state.doc.toString(), pos)
      if (!range) return null
      const line = view.state.doc.lineAt(pos)
      const column = pos - line.from + 1
      const api = getDesktopApi()
      if (isTsLikePath(filePath) && api?.language?.hover) {
        const result = await api.language.hover({
          path: filePath,
          line: line.number,
          column,
          content: view.state.doc.toString()
        })
        const hover = result.success ? result.data : null
        if (hover) {
          return {
            pos: range.from,
            end: range.to,
            above: true,
            create: () => ({
              dom: tooltipDom(hover.title, hover.documentation ?? '', 'F12 to go to definition · Shift+F12 for references')
            })
          }
        }
      }
      const index = api?.codeIndex
      if (!index?.searchSymbol) return null
      const [local, search] = await Promise.all([
        index.fileSymbols ? index.fileSymbols(filePath) : Promise.resolve(null),
        index.searchSymbol(range.word, 8)
      ])
      const here = local?.success ? local.data?.find((item) => item.name === range.word) : undefined
      const hits = search.success ? (search.data ?? []) : []
      const def = hits.find((hit) => hit.name === range.word) ?? hits[0]
      if (!here && !def) return null
      const title = here ? `${here.kind} ${here.name}` : `${def?.kind ?? 'symbol'} ${range.word}`
      const body = here
        ? `This file · line ${here.startLine}`
        : def
          ? `${def.relativePath}:${def.startLine}`
          : range.word
      return {
        pos: range.from,
        end: range.to,
        above: true,
        create: () => ({
          dom: tooltipDom(title, body, 'F12 to go to definition · Shift+F12 for references')
        })
      }
    },
    { hoverTime: 350 }
  )
}
