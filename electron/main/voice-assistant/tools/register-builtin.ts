import { toolRegistry } from './ToolRegistry'
import { getCurrentTimeTool } from './tools/get-current-time'
import {
  copyToClipboardTool,
  getClipboardTool,
  pasteTextTool,
  transformClipboardTool
} from './tools/clipboard'
import { createNoteTool } from './tools/create-note'
import { listNotesTool, readNoteTool, searchNotesTool } from './tools/notes'
import { listProjectsTool, searchProjectTool } from './tools/project'
import { recallFactsTool, rememberFactTool } from './tools/memory'
import { readFileTool, searchLocalFilesTool } from './tools/files'
import { openFileTool } from './tools/open-file'

let registered = false

export function registerBuiltinTools(): void {
  if (registered) return
  toolRegistry.register(getCurrentTimeTool)
  toolRegistry.register(searchLocalFilesTool)
  toolRegistry.register(readFileTool)
  toolRegistry.register(openFileTool)
  toolRegistry.register(copyToClipboardTool)
  toolRegistry.register(getClipboardTool)
  toolRegistry.register(pasteTextTool)
  toolRegistry.register(transformClipboardTool)
  toolRegistry.register(createNoteTool)
  toolRegistry.register(listNotesTool)
  toolRegistry.register(searchNotesTool)
  toolRegistry.register(readNoteTool)
  toolRegistry.register(listProjectsTool)
  toolRegistry.register(searchProjectTool)
  toolRegistry.register(rememberFactTool)
  toolRegistry.register(recallFactsTool)
  registered = true
}
