import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executeStream: vi.fn(),
  getServer: vi.fn(),
  getProject: vi.fn(),
  broadcast: vi.fn()
}))
vi.mock('@vps/core/ConnectionManager', () => ({
  connectionManager: {
    onStatusChange: vi.fn(),
    getStatus: () => 'connected',
    execute: mocks.execute,
    executeStream: mocks.executeStream
  }
}))
vi.mock('../electron/main/vps-manager/vps.repository', () => ({
  vpsRepository: {
    getServer: mocks.getServer,
    getProject: mocks.getProject
  }
}))
vi.mock('../electron/main/vps-manager/vps-crypto', () => ({ decryptCredential: vi.fn() }))
vi.mock('../electron/main/vps-manager/ssh-key', () => ({
  credentialsFromInput: vi.fn(),
  resolveSshAgentSocket: vi.fn()
}))
vi.mock('../electron/main/windows/window-manager', () => ({
  broadcastToWorkbench: mocks.broadcast
}))
import { VPSService } from '../electron/main/vps-manager/vps.service'
const service = new VPSService()
const decode = (wire: string) => Buffer.from(wire.split(' ').at(-1)!, 'base64').toString('utf16le')
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServer.mockReturnValue({ os: 'windows' })
  mocks.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
})
describe('Windows service integration', () => {
  it('surfaces remote file failures instead of reporting a successful save', async () => {
    mocks.execute.mockResolvedValue({ stdout: '', stderr: 'Access denied', exitCode: 1 })
    await expect(service.writeFile('win', 'C:/restricted.txt', 'data')).rejects.toThrow(
      'Access denied'
    )
  })
  it('does not overwrite env files when their backup fails', async () => {
    mocks.execute.mockResolvedValue({ stdout: '', stderr: 'Backup failed', exitCode: 1 })
    await expect(
      service.updateEnv('win', 'C:/app/.env', [{ key: 'A', value: 'B' }])
    ).rejects.toThrow('Backup failed')
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(decode(mocks.execute.mock.calls[0][1])).toContain('Copy-Item -LiteralPath')
  })
  it('reads Windows metrics and preserves the server identity', async () => {
    mocks.execute.mockResolvedValue({
      stdout: JSON.stringify({
        cpu: 25,
        memUsedMb: 500,
        memTotalMb: 1000,
        diskUsedPct: 40,
        uptimeSec: 90,
        loadAvg: 0
      }),
      stderr: '',
      exitCode: 0
    })
    expect(await service.getMetrics('win')).toMatchObject({
      serverId: 'win',
      cpu: 25,
      memTotalMb: 1000
    })
    expect(decode(mocks.execute.mock.calls[0][1])).toContain('Get-CimInstance')
  })
  it('handles empty directories and sorts folders first', async () => {
    mocks.execute.mockResolvedValueOnce({ stdout: '[]', stderr: '', exitCode: 0 })
    expect(await service.listDirectory('win', 'D:/')).toEqual([])
    mocks.execute.mockResolvedValueOnce({
      stdout: '[{"name":"a.txt","type":"file"},{"name":"z","type":"directory"}]',
      stderr: '',
      exitCode: 0
    })
    expect((await service.listDirectory('win', 'D:/'))[0].name).toBe('z')
  })
  it('stops deployments on the first failed Windows step', async () => {
    mocks.getProject.mockReturnValue({
      serverId: 'win',
      path: "D:/Bob's app",
      installCommand: 'npm ci',
      buildCommand: 'npm run build',
      pm2Name: 'app'
    })
    mocks.executeStream.mockResolvedValue(1)
    const deployment = await service.runPipeline('win', 'project')
    expect(deployment.status).toBe('failed')
    expect(mocks.executeStream).toHaveBeenCalledTimes(1)
    expect(decode(mocks.executeStream.mock.calls[0][1])).toContain(
      "Set-Location -LiteralPath 'D:/Bob''s app'; npm ci"
    )
  })
})
