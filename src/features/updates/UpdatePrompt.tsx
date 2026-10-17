import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { PRODUCT_NAME } from '@shared/constants/product'
import { useUpdateStatus } from './useUpdateStatus'

const TOAST_ID = 'app-update'

/** Shows one prompt per new version: restart-to-update, or (macOS) a link to download it. */
export function UpdatePrompt() {
  const { status, install, openRelease } = useUpdateStatus()
  const shownFor = useRef<string | null>(null)

  useEffect(() => {
    if (!status?.latestVersion) return
    const { phase, latestVersion, releaseUrl } = status
    const key = `${phase}:${latestVersion}`
    if (shownFor.current === key) return

    if (phase === 'downloaded') {
      shownFor.current = key
      toast(`${PRODUCT_NAME} ${latestVersion} is ready`, {
        id: TOAST_ID,
        description: 'Restart to finish updating. Your work is saved.',
        duration: Infinity,
        action: {
          label: 'Restart and update',
          onClick: () => {
            void install().then((result) => {
              if (result && !result.success) toast.error(result.error ?? 'Could not install the update')
            })
          }
        },
        cancel: { label: 'Later', onClick: () => undefined }
      })
    } else if (phase === 'available' && status.mode === 'notify' && releaseUrl) {
      shownFor.current = key
      toast(`${PRODUCT_NAME} ${latestVersion} is available`, {
        id: TOAST_ID,
        description: `You have ${status.currentVersion}. Download the new version from GitHub.`,
        duration: Infinity,
        action: { label: 'Download', onClick: () => void openRelease(releaseUrl) },
        cancel: { label: 'Later', onClick: () => undefined }
      })
    }
  }, [status, install, openRelease])

  return null
}
