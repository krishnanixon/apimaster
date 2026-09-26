import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  quoteRemote,
  remoteCommand,
  readRemoteFile,
  writeRemoteFile,
  listWindowsDirectory
} from '../electron/main/vps-manager/remote-platform'
import { isDestructiveCommand } from '../src/modules/vps-manager/core/intentParser'

describe('remote platform commands', () => {
  it('preserves legacy Linux commands', () => {
    expect(remoteCommand('uname -s')).toBe('uname -s')
  })
  it('encodes Unicode PowerShell safely and propagates native and cmdlet failures', () => {
    const command = "Write-Output '你好'; npm run build"
    const wire = remoteCommand(command, 'windows')
    expect(wire).toMatch(/^powershell.exe .* -EncodedCommand [A-Za-z0-9+/=]+$/)
    const decoded = Buffer.from(wire.split(' ').at(-1)!, 'base64').toString('utf16le')
    expect(decoded).toContain(command)
    expect(decoded).toContain('exit $LASTEXITCODE')
    expect(decoded).toContain("$ErrorActionPreference = 'Stop'")
    expect(decoded).toContain('exit 1')
  })
  it('uses literal Windows paths and UTF-8 content without interpolation', () => {
    const path = "D:/O'Brien/$data[1].txt"
    expect(quoteRemote(path, 'windows')).toBe("'D:/O''Brien/$data[1].txt'")
    expect(readRemoteFile(path, 'windows')).toContain("ReadAllText('D:/O''Brien/$data[1].txt')")
    const content = "秘密\r\n$env:PATH ' ` $(whoami)"
    const command = writeRemoteFile(path, content, 'windows')
    const encoded = command.match(/FromBase64String\('([^']+)'\)/)![1]
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(content)
    expect(listWindowsDirectory(path)).toContain('-LiteralPath')
    expect(listWindowsDirectory(path)).toContain('-InputObject @(')
  })
  it('round-trips Linux file contents and paths containing shell metacharacters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vps-test-'))
    try {
      const path = join(dir, "quotes' $HOME $(whoami).txt")
      const content = "hello ' $HOME $(whoami)\n你好\n"
      execFileSync('/bin/sh', ['-c', writeRemoteFile(path, content, 'linux')])
      expect(readFileSync(path, 'utf8')).toBe(content)
      expect(
        execFileSync('/bin/sh', ['-c', readRemoteFile(path, 'linux')], { encoding: 'utf8' })
      ).toBe(content)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('recognizes destructive Windows operations', () => {
    expect(isDestructiveCommand('Remove-Item C:/data -Recurse')).toBe(true)
    expect(isDestructiveCommand('Restart-Computer')).toBe(true)
    expect(isDestructiveCommand('Get-Service')).toBe(false)
  })
})
