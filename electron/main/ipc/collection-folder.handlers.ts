import { app, dialog, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import { COLLECTION_FILE } from '@shared/lib/collection-files'
import { MAX_COLLECTION_FILES } from '@shared/lib/collection-files/node'
import { collectionFoldersService } from '../infra/collection-folders.service'
import { logger } from '../infra/logger.service'
import { ipcSchemas, schema, validatedHandle } from './runtime-schema'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: unknown, fallback: string): IpcResult<T> {
  const message = error instanceof Error ? error.message : fallback
  logger.error(message, 'CollectionFolderIPC')
  return { success: false, error: message }
}

const filesSchema = schema.record(ipcSchemas.text, { maxKeys: MAX_COLLECTION_FILES })
const pathListSchema = schema.optional(schema.array(ipcSchemas.path, { max: MAX_COLLECTION_FILES }))

export function registerCollectionFolderHandlers(getMainWindow: () => BrowserWindow | null): void {
  validatedHandle(
    IPC_CHANNELS.COLLECTION_FOLDER_PICK,
    [
      schema.object({
        mode: schema.literal('open', 'save'),
        collectionName: schema.optional(ipcSchemas.shortText),
        collectionId: schema.optional(ipcSchemas.id)
      })
    ],
    async (_event, input): Promise<IpcResult<string | null>> => {
      try {
        const win = getMainWindow()
        if (!win) return failure(null, 'No active window')
        const result = await dialog.showOpenDialog(win, {
          title: input.mode === 'open' ? 'Open a collection folder' : `Choose where to save "${input.collectionName ?? 'collection'}"`,
          buttonLabel: input.mode === 'open' ? 'Open Folder' : 'Save Here',
          message:
            input.mode === 'open'
              ? `Choose a folder that contains ${COLLECTION_FILE}`
              : 'Pick an empty folder, or a folder (e.g. your repo) to create the collection folder in',
          properties: ['openDirectory', 'createDirectory']
        })
        if (result.canceled || !result.filePaths[0]) return success(null)
        const picked = result.filePaths[0]
        const target =
          input.mode === 'save'
            ? await collectionFoldersService.resolveSaveTarget(picked, input.collectionName ?? 'collection', input.collectionId ?? '')
            : picked
        return success(collectionFoldersService.approve(target))
      } catch (error) {
        return failure(error, 'Failed to choose a folder')
      }
    }
  )

  validatedHandle(IPC_CHANNELS.COLLECTION_FOLDER_READ, [ipcSchemas.path], async (_event, path) => {
    try {
      return success(await collectionFoldersService.read(path))
    } catch (error) {
      return failure(error, 'Failed to read the collection folder')
    }
  })

  validatedHandle(
    IPC_CHANNELS.COLLECTION_FOLDER_WRITE,
    [
      schema.object({
        path: ipcSchemas.path,
        files: filesSchema,
        protectedPaths: pathListSchema,
        createIfMissing: schema.optional(filesSchema)
      })
    ],
    async (_event, input) => {
      try {
        return success(
          await collectionFoldersService.write(input.path, input.files, {
            protectedPaths: input.protectedPaths,
            createIfMissing: input.createIfMissing
          })
        )
      } catch (error) {
        return failure(error, 'Failed to save the collection folder')
      }
    }
  )

  validatedHandle(IPC_CHANNELS.COLLECTION_FOLDER_WATCH, [ipcSchemas.path], (_event, path) => {
    try {
      collectionFoldersService.watch(path, (root, files) => {
        getMainWindow()?.webContents.send(IPC_CHANNELS.COLLECTION_FOLDER_CHANGED, { path: root, files })
      })
      return success()
    } catch (error) {
      return failure(error, 'Failed to watch the collection folder')
    }
  })

  validatedHandle(IPC_CHANNELS.COLLECTION_FOLDER_UNWATCH, [ipcSchemas.path], (_event, path) => {
    collectionFoldersService.unwatch(path)
    return success()
  })

  validatedHandle(IPC_CHANNELS.COLLECTION_FOLDER_FORGET, [ipcSchemas.path], (_event, path) => {
    collectionFoldersService.forget(path)
    return success()
  })

  validatedHandle(IPC_CHANNELS.COLLECTION_FOLDER_REVEAL, [ipcSchemas.path], (_event, path) => {
    shell.showItemInFolder(join(path, COLLECTION_FILE))
    return success()
  })

  app.on('before-quit', () => collectionFoldersService.dispose())
}
