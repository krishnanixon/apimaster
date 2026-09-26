import { getDesktopApi } from '@/shared/lib/desktop-api'
import { isTsLikePath } from './language-files'

const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleLanguageBuffer(path: string, content: string): void {
  if (!isTsLikePath(path)) return
  const existing = timers.get(path)
  if (existing) clearTimeout(existing)
  timers.set(
    path,
    setTimeout(() => {
      timers.delete(path)
      void getDesktopApi()?.language?.updateBuffer(path, content)
    }, 320)
  )
}

export function flushLanguageBuffer(path: string, content: string): void {
  const existing = timers.get(path)
  if (existing) clearTimeout(existing)
  timers.delete(path)
  if (!isTsLikePath(path)) return
  void getDesktopApi()?.language?.updateBuffer(path, content)
}
