import { describe, expect, it } from 'vitest'
import {
  encodeWorkbenchPath,
  fileNameOf,
  parseWorkbenchPath,
  WORKBENCH_PATH_MIME
} from '../shared/lib/workbench-dnd'

describe('workbench drag and drop', () => {
  it('uses a custom MIME type for tree paths', () => {
    expect(WORKBENCH_PATH_MIME).toBe('application/x-workbench-path')
  })

  it('round-trips file and folder payloads', () => {
    const file = encodeWorkbenchPath({ path: 'C:\\proj\\src\\app.ts', name: 'app.ts', isDirectory: false })
    expect(parseWorkbenchPath(file)).toEqual({
      path: 'C:\\proj\\src\\app.ts',
      name: 'app.ts',
      isDirectory: false
    })

    const folder = encodeWorkbenchPath({ path: '/proj/src', name: 'src', isDirectory: true })
    expect(parseWorkbenchPath(folder)?.isDirectory).toBe(true)
  })

  it('rejects empty, invalid, or incomplete payloads', () => {
    expect(parseWorkbenchPath('')).toBeNull()
    expect(parseWorkbenchPath('not-json')).toBeNull()
    expect(parseWorkbenchPath(JSON.stringify({ name: 'a.ts' }))).toBeNull()
    expect(parseWorkbenchPath(JSON.stringify({ path: ' ', name: 'a.ts' }))).toBeNull()
  })

  it('reads the last path segment as a file name', () => {
    expect(fileNameOf('C:\\proj\\src\\app.ts')).toBe('app.ts')
    expect(fileNameOf('/proj/src/lib')).toBe('lib')
  })
})
