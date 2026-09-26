import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('node_modules/kokoro-js/voices')
const target = resolve('out/voices')

await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })
