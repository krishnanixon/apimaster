import { describe, expect, it } from 'vitest'
import {
  applyAllConflictResolutions,
  applyConflictResolution,
  hasConflictMarkers,
  parseConflictMarkers
} from '../shared/lib/merge-conflicts'
import { parseInspectorWebSocketUrl, pathToBreakpointRegex } from '../shared/lib/debug-protocol'

const SAMPLE = `keep
<<<<<<< HEAD
current line
=======
incoming line
>>>>>>> feature
after
`

describe('merge conflict markers', () => {
  it('parses a single hunk and applies current, incoming, and both', () => {
    expect(hasConflictMarkers(SAMPLE)).toBe(true)
    const hunks = parseConflictMarkers(SAMPLE)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.current).toBe('current line')
    expect(hunks[0]?.incoming).toBe('incoming line')
    expect(applyConflictResolution(SAMPLE, hunks[0]!, 'current')).toContain('current line')
    expect(applyConflictResolution(SAMPLE, hunks[0]!, 'current')).not.toContain('<<<<<<<')
    expect(applyConflictResolution(SAMPLE, hunks[0]!, 'incoming')).toContain('incoming line')
    expect(applyAllConflictResolutions(SAMPLE, 'both')).toContain('current line\nincoming line')
  })

  it('returns no hunks for clean source', () => {
    expect(parseConflictMarkers('export const ok = 1\n')).toEqual([])
  })
})

describe('debug protocol helpers', () => {
  it('extracts the inspector websocket URL', () => {
    const output = 'Debugger listening on ws://127.0.0.1:9229/abc-def\n'
    expect(parseInspectorWebSocketUrl(output)).toBe('ws://127.0.0.1:9229/abc-def')
  })

  it('builds a path regex that matches windows and posix separators', () => {
    expect(pathToBreakpointRegex('C:/proj/src/app.ts')).toContain('[/\\\\]')
  })
})
