import { create } from 'zustand'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import type { SeoAuditReport, SeoCrawlReport } from '@shared/types/seo-audit'

interface SeoAuditState {
  report: SeoAuditReport | null
  crawlReport: SeoCrawlReport | null
  auditLoading: boolean
  crawlLoading: boolean
  error: string | null
  run: () => Promise<void>
  crawl: (startUrl: string, maxPages?: number) => Promise<void>
  clear: () => void
}

export const useSeoAuditStore = create<SeoAuditState>((set, get) => ({
  report: null,
  crawlReport: null,
  auditLoading: false,
  crawlLoading: false,
  error: null,
  run: async () => {
    if (get().auditLoading) return
    set({ auditLoading: true, error: null })
    const api = await waitForDesktopApi()
    if (!api?.seoAudit) {
      set({ auditLoading: false, error: 'SEO audit is available in the desktop application.' })
      return
    }
    const result = await api.seoAudit.run()
    if (!result.success || !result.data) {
      set({ auditLoading: false, error: result.error ?? 'SEO audit failed' })
      return
    }
    set({ report: result.data, auditLoading: false, error: null })
  },
  crawl: async (startUrl, maxPages = 100) => {
    if (get().crawlLoading) return
    set({ crawlLoading: true, error: null })
    const api = await waitForDesktopApi()
    if (!api?.seoAudit) return set({ crawlLoading: false, error: 'Site crawler is available in the desktop application.' })
    const result = await api.seoAudit.crawl({ startUrl, maxPages })
    if (!result.success || !result.data) return set({ crawlLoading: false, error: result.error ?? 'Site crawl failed' })
    set({ crawlReport: result.data, crawlLoading: false, error: null })
  },
  clear: () => set({ report: null, crawlReport: null, auditLoading: false, crawlLoading: false, error: null })
}))
