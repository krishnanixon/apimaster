import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { TerminalExecRequest, TerminalWorkspaceState } from '@shared/types/terminal'
import { classifyCommandRisk } from '@shared/lib/command-risk'
import { terminalService } from '../terminal/terminal.service'
import { terminalStateService } from '../terminal/terminal-state.service'
import { commandExecService } from '../terminal/command-exec.service'
import { codeEditorService } from '../code-editor/code-editor.service'
import { logger } from '../infra/logger.service'
import { ipcSchemas, schema, validatedHandle } from './runtime-schema'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'TerminalIPC')
  return { success: false, error }
}

export function registerTerminalHandlers(getMainWindow: () => BrowserWindow | null): void {
  validatedHandle(
    IPC_CHANNELS.TERMINAL_CREATE,
    [ipcSchemas.id, ipcSchemas.path, schema.optional(schema.number({ integer: true, min: 1, max: 1_000 })), schema.optional(schema.number({ integer: true, min: 1, max: 1_000 }))] as const,
    async (_e, id, cwd, cols, rows) => {
      try {
        terminalService.create(id, cwd, cols ?? 80, rows ?? 24)
        return success()
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to create terminal')
      }
    },
    'TerminalIPC'
  )

  validatedHandle(IPC_CHANNELS.TERMINAL_WRITE, [ipcSchemas.id, ipcSchemas.text] as const, async (_e, id, data) => {
    try {
      terminalService.write(id, data)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to write to terminal')
    }
  }, 'TerminalIPC')

  validatedHandle(
    IPC_CHANNELS.TERMINAL_RESIZE,
    [ipcSchemas.id, schema.number({ integer: true, min: 1, max: 1_000 }), schema.number({ integer: true, min: 1, max: 1_000 })] as const,
    async (_e, id, cols, rows) => {
      try {
        terminalService.resize(id, cols, rows)
        return success()
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to resize terminal')
      }
    },
    'TerminalIPC'
  )

  validatedHandle(IPC_CHANNELS.TERMINAL_RUN, [ipcSchemas.id, ipcSchemas.shortText] as const, async (_e, id, command) => {
    try {
      terminalService.run(id, command)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to run command')
    }
  }, 'TerminalIPC')

  ipcMain.handle(IPC_CHANNELS.TERMINAL_STOP, async (_e, id: string) => {
    try {
      terminalService.stop(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to stop terminal')
    }
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DISPOSE, async (_e, id: string) => {
    try {
      terminalService.dispose(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to dispose terminal')
    }
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_GET_WORKSPACE_STATE, async () => {
    try {
      return success(terminalStateService.get())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load terminal state')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_SAVE_WORKSPACE_STATE,
    async (_e, state: TerminalWorkspaceState) => {
      try {
        terminalStateService.save(state)
        return success()
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save terminal state')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.TERMINAL_PICK_FOLDER, async () => {
    try {
      return success(await codeEditorService.openFolder(getMainWindow()))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to pick folder')
    }
  })

  validatedHandle(IPC_CHANNELS.TERMINAL_OPEN_FOLDER_PATH, [ipcSchemas.path] as const, async (_e, rootPath) => {
    try {
      return success(await codeEditorService.openFolderAtPath(rootPath))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to open folder path')
    }
  }, 'TerminalIPC')

  validatedHandle(IPC_CHANNELS.TERMINAL_EXEC, [schema.object({
    id: ipcSchemas.id,
    command: ipcSchemas.shortText,
    cwd: ipcSchemas.path,
    timeoutMs: schema.optional(schema.number({ integer: true, min: 100, max: 3_600_000 })),
    env: schema.optional(schema.record(schema.string({ max: 32_768 }), { maxKeys: 256 })),
    acceptRisk: schema.optional(schema.boolean())
  }) as import('./runtime-schema').RuntimeSchema<TerminalExecRequest>] as const, async (_e, request) => {
    try {
      return success(await commandExecService.exec(request))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to execute command')
    }
  }, 'TerminalIPC')

  ipcMain.handle(IPC_CHANNELS.TERMINAL_EXEC_CANCEL, async (_e, id: string) => {
    try {
      return success(commandExecService.cancel(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to cancel command')
    }
  })

  validatedHandle(IPC_CHANNELS.TERMINAL_CLASSIFY_COMMAND, [ipcSchemas.shortText] as const, async (_e, command) => {
    try {
      return success(classifyCommandRisk(command))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to classify command')
    }
  }, 'TerminalIPC')
}
