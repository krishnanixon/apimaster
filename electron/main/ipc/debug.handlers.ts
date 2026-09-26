import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { DebugBreakpoint, DebugLaunchInput } from '@shared/types/debug'
import { nodeDebuggerService } from '../debug/node-debugger.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'DebugIPC')
  return { success: false, error }
}

export function registerDebugHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DEBUG_START, async (_e, input: DebugLaunchInput) => {
    try {
      return success(await nodeDebuggerService.start(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to start debugger')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_STOP, async () => {
    try {
      return success(await nodeDebuggerService.stop())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to stop debugger')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_CONTINUE, async () => {
    try {
      await nodeDebuggerService.continue()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to continue')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_PAUSE, async () => {
    try {
      await nodeDebuggerService.pause()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to pause')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_STEP_OVER, async () => {
    try {
      await nodeDebuggerService.stepOver()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to step over')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_STEP_INTO, async () => {
    try {
      await nodeDebuggerService.stepInto()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to step into')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_STEP_OUT, async () => {
    try {
      await nodeDebuggerService.stepOut()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to step out')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_EVAL, async (_e, expression: string) => {
    try {
      return success(await nodeDebuggerService.evaluate(String(expression ?? '')))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Evaluate failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_SET_BREAKPOINTS, async (_e, breakpoints: DebugBreakpoint[]) => {
    try {
      nodeDebuggerService.setBreakpoints(Array.isArray(breakpoints) ? breakpoints : [])
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to set breakpoints')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_SNAPSHOT, async () => {
    try {
      return success(nodeDebuggerService.snapshot())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read debug snapshot')
    }
  })
}
