import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { GitCheckoutInput, GitCommitInput, GitRevertInput } from '@shared/types/git'
import { gitService } from '../git/git.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'GitIPC')
  return { success: false, error }
}

export function registerGitHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async () => {
    try {
      await gitService.initialize()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to initialize repository')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async () => {
    try {
      return success(await gitService.snapshot())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read git status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF, async (_e, path: string, staged: boolean) => {
    try {
      return success(await gitService.diff(path, Boolean(staged)))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read git diff')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_FILE_AT_HEAD, async (_e, path: string) => {
    try {
      return success(await gitService.fileAtHead(path))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read file at HEAD')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_e, limit?: number) => {
    try {
      return success(await gitService.log(limit))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read git log')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (_e, path: string) => {
    try {
      await gitService.stage(path)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to stage file')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (_e, path: string) => {
    try {
      await gitService.unstage(path)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to unstage file')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (_e, input: GitCommitInput) => {
    try {
      await gitService.commit(input)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to commit')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_CHECKOUT, async (_e, input: GitCheckoutInput) => {
    try {
      await gitService.checkout(input)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to checkout')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_REVERT, async (_e, input: GitRevertInput) => {
    try {
      await gitService.revert(input)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to revert')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_FETCH, async () => {
    try {
      return success(await gitService.fetch())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to fetch')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async () => {
    try {
      return success(await gitService.pull())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to pull')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async () => {
    try {
      return success(await gitService.push())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to push')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STASH, async (_e, message?: string) => {
    try {
      return success(await gitService.stash(message))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to stash')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STASH_POP, async () => {
    try {
      return success(await gitService.stashPop())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to pop stash')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STASH_LIST, async () => {
    try {
      return success(await gitService.stashes())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list stashes')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STASH_APPLY, async (_e, ref: string, pop?: boolean) => {
    try {
      return success(await gitService.applyStash(ref, Boolean(pop)))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to apply stash')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STASH_DROP, async (_e, ref: string) => {
    try {
      await gitService.dropStash(ref)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to drop stash')
    }
  })
}
