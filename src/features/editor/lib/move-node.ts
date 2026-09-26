import { NodeSelection } from 'prosemirror-state'
import type { Editor } from '@tiptap/react'

/** Swap the selected block node with its sibling above or below. */
export function moveSelectedNode(editor: Editor, direction: 'up' | 'down', nodeName = 'image'): boolean {
  const { state } = editor
  const { selection } = state

  if (!(selection instanceof NodeSelection) || selection.node.type.name !== nodeName) {
    return false
  }

  const $from = selection.$from
  const depth = $from.depth
  const index = $from.index(depth)
  const parent = $from.parent
  const targetIndex = direction === 'up' ? index - 1 : index + 1

  if (targetIndex < 0 || targetIndex >= parent.childCount) {
    return false
  }

  const nodeA = parent.child(index)
  const nodeB = parent.child(targetIndex)
  const parentStart = $from.start(depth)

  let posA = parentStart
  for (let i = 0; i < index; i++) posA += parent.child(i).nodeSize

  let posB = parentStart
  for (let i = 0; i < targetIndex; i++) posB += parent.child(i).nodeSize

  const tr = state.tr

  if (index < targetIndex) {
    tr.delete(posB, posB + nodeB.nodeSize)
    tr.delete(posA, posA + nodeA.nodeSize)
    tr.insert(posA, nodeB)
    tr.insert(posA + nodeB.nodeSize, nodeA)
    const newPos = posA + (direction === 'down' ? nodeB.nodeSize : 0)
    tr.setSelection(NodeSelection.create(tr.doc, newPos))
  } else {
    tr.delete(posA, posA + nodeA.nodeSize)
    tr.delete(posB, posB + nodeB.nodeSize)
    tr.insert(posB, nodeA)
    tr.insert(posB + nodeA.nodeSize, nodeB)
    const newPos = posB + (direction === 'up' ? 0 : nodeB.nodeSize)
    tr.setSelection(NodeSelection.create(tr.doc, newPos))
  }

  editor.view.dispatch(tr)
  return true
}
