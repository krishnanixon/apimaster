import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { SeoAuditReport, SeoCrawlOptions, SeoCrawlReport } from '@shared/types/seo-audit'
import { logger } from '../infra/logger.service'
import { seoAuditService } from '../seo/seo-audit.service'
import { seoCrawlerService } from '../seo/seo-crawler.service'

export function registerSeoAuditHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEO_AUDIT_RUN, async (): Promise<IpcResult<SeoAuditReport>> => {
    try {
      return { success: true, data: await seoAuditService.run() }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SEO audit failed'
      logger.error(message, 'SeoAuditIPC')
      return { success: false, error: message }
    }
  })
  ipcMain.handle(IPC_CHANNELS.SEO_CRAWL_RUN, async (_event, options: SeoCrawlOptions): Promise<IpcResult<SeoCrawlReport>> => {
    try {
      return { success: true, data: await seoCrawlerService.crawl(options) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Site crawl failed'
      logger.error(message, 'SeoCrawlerIPC')
      return { success: false, error: message }
    }
  })
}
