import { useCallback, useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

/** Live updater status from the main process (null outside Electron or before the first read). */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    void waitForDesktopApi().then(async (api) => {
      if (cancelled || !api?.updater) return
      unsubscribe = api.updater.onStatus(setStatus)
      const result = await api.updater.getStatus()
      if (!cancelled && result.success && result.data) setStatus(result.data)
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const check = useCallback(async () => {
    const api = await waitForDesktopApi()
    const result = await api?.updater?.check()
    if (result?.success && result.data) setStatus(result.data)
    return result?.data ?? null
  }, [])

  const install = useCallback(async () => {
    const api = await waitForDesktopApi()
    return api?.updater?.install()
  }, [])

  const openRelease = useCallback(async (url: string) => {
    const api = await waitForDesktopApi()
    await api?.app.openExternal(url)
  }, [])

  return { status, check, install, openRelease }
}
