import { app, net, protocol } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

export const PRESENTATION_ASSET_SCHEME = 'presentation-asset'

function root(): string {
  return join(app.getPath('userData'), 'presentation-assets')
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 256)
}

export async function importPresentationAsset(
  presentationId: string,
  name: string,
  dataUrl: string
): Promise<string> {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/
  )
  if (!match) throw new Error('Unsupported image format')
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024)
    throw new Error('Image must be between 1 byte and 20 MB')
  const extension =
    extname(name).toLowerCase() ||
    (match[1] === 'image/jpeg'
      ? '.jpg'
      : match[1] === 'image/svg+xml'
        ? '.svg'
        : `.${match[1].split('/')[1]}`)
  const folder = safeSegment(presentationId)
  const fileName = `${randomUUID()}${extension.replace(/[^a-z0-9.]/g, '')}`
  await mkdir(join(root(), folder), { recursive: true })
  await writeFile(join(root(), folder, fileName), bytes)
  return `${PRESENTATION_ASSET_SCHEME}://${folder}/${fileName}`
}

export function registerPresentationAssetProtocol(): void {
  protocol.handle(PRESENTATION_ASSET_SCHEME, (request) => {
    const url = new URL(request.url)
    const candidate = resolve(
      root(),
      safeSegment(url.hostname),
      safeFileName(url.pathname.slice(1))
    )
    const allowedRoot = resolve(root()) + sep
    if (!candidate.startsWith(allowedRoot)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(candidate).toString())
  })
}

export function resolvePresentationAssetPath(src: string): string | null {
  try {
    const url = new URL(src)
    if (url.protocol !== `${PRESENTATION_ASSET_SCHEME}:`) return null
    const candidate = resolve(
      root(),
      safeSegment(url.hostname),
      safeFileName(url.pathname.slice(1))
    )
    return candidate.startsWith(resolve(root()) + sep) ? candidate : null
  } catch {
    return null
  }
}
