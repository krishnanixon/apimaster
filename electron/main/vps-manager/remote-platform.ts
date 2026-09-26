import type { ServerOS } from '@shared/types/vps'

export function quoteRemote(value: string, os: ServerOS = 'linux'): string {
  return os === 'windows' ? `'${value.replace(/'/g, "''")}'` : `'${value.replace(/'/g, "'\\''")}'`
}

/** EncodedCommand works with both cmd.exe and PowerShell as the SSH default shell. */
export function remoteCommand(command: string, os: ServerOS = 'linux'): string {
  if (os !== 'windows') return command
  const script = `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); try {\n${command}\nif ($LASTEXITCODE) { exit $LASTEXITCODE }\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`
  return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`
}

export function readRemoteFile(path: string, os: ServerOS): string {
  const q = quoteRemote(path, os)
  return os === 'windows' ? `[Console]::Write([System.IO.File]::ReadAllText(${q}))` : `cat -- ${q}`
}

export function writeRemoteFile(path: string, content: string, os: ServerOS): string {
  const q = quoteRemote(path, os)
  return os === 'windows'
    ? `[System.IO.File]::WriteAllText(${q}, [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(content, 'utf8').toString('base64')}')), [System.Text.UTF8Encoding]::new($false))`
    : `printf '%s' ${quoteRemote(content)} > ${q}`
}

export const WINDOWS_METRICS = `
$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($os.SystemDrive)'"
[ordered]@{
 cpu = [math]::Round($cpu)
 memUsedMb = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024)
 memTotalMb = [math]::Round($os.TotalVisibleMemorySize / 1024)
 diskUsedPct = [math]::Round(100 * ($disk.Size - $disk.FreeSpace) / $disk.Size)
 uptimeSec = [math]::Floor(((Get-Date) - $os.LastBootUpTime).TotalSeconds)
 loadAvg = 0
} | ConvertTo-Json -Compress`

export function listWindowsDirectory(path: string): string {
  return `ConvertTo-Json -Compress -Depth 3 -InputObject @(Get-ChildItem -LiteralPath ${quoteRemote(path, 'windows')} -Force | ForEach-Object { @{ name = $_.Name; path = $_.FullName.Replace('\\', '/'); type = $(if ($_.PSIsContainer) { 'directory' } else { 'file' }); size = $_.Length; modified = $_.LastWriteTimeUtc.ToString('o') } })`
}
