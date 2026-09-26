export const WORKBENCH_PATH_MIME = 'application/x-workbench-path'

export interface WorkbenchPathPayload {
  path: string
  name: string
  isDirectory: boolean
}

export function encodeWorkbenchPath(payload: WorkbenchPathPayload): string {
  return JSON.stringify(payload)
}

export function parseWorkbenchPath(raw: string | null | undefined): WorkbenchPathPayload | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<WorkbenchPathPayload>
    if (typeof parsed.path !== 'string' || !parsed.path.trim()) return null
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) return null
    return {
      path: parsed.path,
      name: parsed.name,
      isDirectory: parsed.isDirectory === true
    }
  } catch {
    return null
  }
}

export function fileNameOf(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}
