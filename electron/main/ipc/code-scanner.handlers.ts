import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CodeScanEnrichEstimate,
  CodeScanEnrichResult,
  CodeScanResult,
  DetectedEndpoint
} from '@shared/types/code-scanner'
import { codeScannerService } from '../code-scanner/code-scanner.service'
import { codeScannerAiService } from '../code-scanner/code-scanner-ai.service'
import { openSourceInEditor } from '../code-scanner/open-in-editor'
import { readSourceSnippets, type SourceSnippet } from '../code-scanner/source-snippets'
import { logger } from '../infra/logger.service'
import { ipcSchemas, schema, validatedHandle } from './runtime-schema'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'CodeScannerIPC')
  return { success: false, error }
}

export function registerCodeScannerHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.CODE_SCANNER_PICK_FOLDER, async (): Promise<IpcResult<string | null>> => {
    try {
      const win = getMainWindow()
      if (!win) return failure('No active window')
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose a project folder to scan',
        buttonLabel: 'Scan Folder',
        properties: ['openDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return success(null)
      return success(codeScannerService.approveRoot(result.filePaths[0]))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to choose a folder')
    }
  })

  validatedHandle(
    IPC_CHANNELS.CODE_SCANNER_SCAN,
    [schema.object({ scanId: ipcSchemas.id, rootPath: ipcSchemas.path })] as const,
    async (event, input): Promise<IpcResult<CodeScanResult>> => {
      try {
        const result = await codeScannerService.scan(input, (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.CODE_SCANNER_PROGRESS, progress)
        })
        return success(result)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Scan failed')
      }
    },
    'CodeScannerIPC'
  )

  validatedHandle(IPC_CHANNELS.CODE_SCANNER_CANCEL, [ipcSchemas.id] as const, (_event, id) => {
    codeScannerService.cancel(id)
    codeScannerAiService.cancel(id)
    return success()
  }, 'CodeScannerIPC')

  validatedHandle(
    IPC_CHANNELS.CODE_SCANNER_OPEN_SOURCE,
    [schema.object({ rootPath: ipcSchemas.path, file: ipcSchemas.path, line: schema.number({ integer: true, min: 1, max: 10_000_000 }) })] as const,
    async (_event, input): Promise<IpcResult<{ editor: string | null }>> => {
      try {
        const root = codeScannerService.approvedRoot(input.rootPath)
        if (!root) return failure('Scan the folder again to open its files')
        return success(await openSourceInEditor(root, input.file, input.line))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Could not open the file')
      }
    },
    'CodeScannerIPC'
  )

  validatedHandle(
    IPC_CHANNELS.CODE_SCANNER_READ_SOURCE,
    [
      schema.object({
        rootPath: ipcSchemas.path,
        locations: schema.array(schema.object({ file: ipcSchemas.path, line: schema.number({ integer: true, min: 1, max: 10_000_000 }) }), { max: 10 })
      })
    ] as const,
    (_event, input): IpcResult<SourceSnippet[]> => {
      const root = codeScannerService.approvedRoot(input.rootPath)
      if (!root) return failure(`${input.rootPath} hasn't been scanned in Shurikly; open Code Scanner and choose that folder first`)
      return success(readSourceSnippets(root, input.locations))
    },
    'CodeScannerIPC'
  )

  validatedHandle(
    IPC_CHANNELS.CODE_SCANNER_SCAN_REF,
    [schema.object({ rootPath: ipcSchemas.path, ref: schema.string({ min: 1, max: 256 }) })] as const,
    async (_event, input): Promise<IpcResult<{ commit: string; endpoints: DetectedEndpoint[]; truncated: boolean }>> => {
      try {
        return success(await codeScannerService.scanAtRef(input.rootPath, input.ref))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Could not scan that branch')
      }
    },
    'CodeScannerIPC'
  )

  validatedHandle(
    IPC_CHANNELS.CODE_SCANNER_WATCH,
    [schema.nullable(ipcSchemas.path)] as const,
    (event, rootPath): IpcResult => {
      try {
        codeScannerService.watch(rootPath, (root) => {
          if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.CODE_SCANNER_CHANGED, root)
        })
        return success()
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Could not watch the folder')
      }
    },
    'CodeScannerIPC'
  )

  const endpointList = schema.array(schema.unknown<DetectedEndpoint>(), { max: 5000 })

  validatedHandle(
    IPC_CHANNELS.CODE_SCANNER_ENRICH_ESTIMATE,
    [schema.object({ rootPath: ipcSchemas.path, endpoints: endpointList })] as const,
    async (_event, input): Promise<IpcResult<CodeScanEnrichEstimate>> => {
      try {
        const root = codeScannerService.approvedRoot(input.rootPath)
        if (!root) return failure('Scan the folder again before enriching it')
        return success(await codeScannerAiService.estimate(root, input.endpoints))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Could not estimate enrichment')
      }
    },
    'CodeScannerIPC'
  )

  validatedHandle(
    IPC_CHANNELS.CODE_SCANNER_ENRICH,
    [schema.object({ enrichId: ipcSchemas.id, rootPath: ipcSchemas.path, endpoints: endpointList })] as const,
    async (event, input): Promise<IpcResult<CodeScanEnrichResult>> => {
      try {
        const root = codeScannerService.approvedRoot(input.rootPath)
        if (!root) return failure('Scan the folder again before enriching it')
        const result = await codeScannerAiService.enrich(root, input, (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.CODE_SCANNER_ENRICH_PROGRESS, progress)
        })
        return success(result)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Enrichment failed')
      }
    },
    'CodeScannerIPC'
  )
}
