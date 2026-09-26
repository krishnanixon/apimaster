import { useEffect, useRef, useState } from 'react'
import { Cable, Check, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { McpServerStatus } from '@shared/mcp/types'
import { MCP_SERVER_NAME } from '@shared/mcp/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { SettingToggle } from '@/features/settings/components/SettingToggle'
import { SettingsGroup, SettingsRow, SettingsSection } from '@/features/settings/components/SettingsSection'
import { writeClipboardText } from '@/shared/lib/clipboard'

function cursorConfig(status: McpServerStatus): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          type: 'http',
          url: status.url,
          headers: { Authorization: `Bearer ${status.token}` }
        }
      }
    },
    null,
    2
  )
}

export function McpSettings() {
  const [status, setStatus] = useState<McpServerStatus | null>(null)
  const [portDraft, setPortDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const portSeeded = useRef(false)

  async function refresh() {
    const res = await window.electronAPI.mcp.getStatus()
    if (res.success && res.data) setStatus(res.data)
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!status || portSeeded.current) return
    portSeeded.current = true
    setPortDraft(String(status.port))
  }, [status])

  async function save(patch: { enabled?: boolean; port?: number; exposeSecrets?: boolean }) {
    setBusy(true)
    try {
      const res = await window.electronAPI.mcp.updateConfig(patch)
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Could not update MCP settings')
        return
      }
      setStatus(res.data)
      setPortDraft(String(res.data.port))
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, label: string) {
    try {
      await writeClipboardText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  if (!status) {
    return <p className="text-sm text-muted-foreground">Loading MCP settings…</p>
  }

  const port = Number(portDraft)
  const runningLabel = !status.enabled ? 'Off' : status.running ? 'Running' : 'Not running'

  return (
    <SettingsSection>
      <SettingsGroup
        title="Local MCP server"
        description="Agents on this computer can read and edit the open workspace, and send requests through APIMaster. The server listens on localhost only."
        icon={Cable}
        flush
      >
        <SettingToggle
          label="Enable MCP server"
          description={
            status.error
              ? status.error
              : status.enabled && status.running
                ? status.rendererReady
                  ? `Listening at ${status.url}`
                  : 'Waiting for the window to finish loading'
                : 'Turn this on, then connect Claude, Cursor, or another MCP client.'
          }
          checked={status.enabled}
          disabled={busy}
          onChange={(enabled) => void save({ enabled, port: Number.isInteger(port) ? port : status.port })}
        />
        <SettingToggle
          label="Expose secret values"
          description="Off by default. Tokens, passwords, and sensitive headers are replaced with [REDACTED]. Sending that placeholder back keeps the stored secret."
          checked={status.exposeSecrets}
          disabled={busy}
          onChange={(exposeSecrets) => void save({ exposeSecrets })}
        />
        <SettingsRow
          label="Port"
          description="Localhost port. Changing it restarts the server. Agents must use the new URL."
          htmlFor="mcp-port"
        >
          <Input
            id="mcp-port"
            className="w-28"
            inputMode="numeric"
            value={portDraft}
            disabled={busy}
            onChange={(event) => setPortDraft(event.target.value)}
            onBlur={() => {
              if (!Number.isInteger(port) || port === status.port) return
              void save({ port, enabled: status.enabled })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
            }}
          />
        </SettingsRow>
        <SettingsRow label="Status" description="The token is a local password. Do not share it." stacked>
          <div className="space-y-2">
            <Badge variant={status.running ? 'default' : 'secondary'}>{runningLabel}</Badge>
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded-md bg-muted px-2 py-1 text-xs">{status.token}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy(status.token, 'Token')}>
                <Copy />
                Copy token
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Generate a new token? Claude Desktop reads it from the app. Other agents need the new token in their config.')) {
                    return
                  }
                  setBusy(true)
                  void window.electronAPI.mcp
                    .regenerateToken()
                    .then((res) => {
                      if (!res.success || !res.data) {
                        toast.error(res.error ?? 'Could not regenerate the token')
                        return
                      }
                      setStatus(res.data)
                      toast.success('Token regenerated')
                    })
                    .finally(() => setBusy(false))
                }}
              >
                <RefreshCw />
                New token
              </Button>
            </div>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Claude Desktop"
        description="Writes an entry into Claude Desktop's MCP config. Quit Claude Desktop and open it again after installing."
        icon={Cable}
        flush
      >
        <SettingsRow
          label="Claude Desktop"
          description={status.claudeDesktop.installed ? status.claudeDesktop.configPath : 'Not installed yet.'}
        >
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void window.electronAPI.mcp
                .installClaudeDesktop()
                .then(async (res) => {
                  if (!res.success) {
                    toast.error(res.error ?? 'Could not update Claude Desktop')
                    return
                  }
                  toast.success('Claude Desktop config updated. Quit Claude and open it again.')
                  await refresh()
                })
                .finally(() => setBusy(false))
            }}
          >
            {status.claudeDesktop.installed ? <Check /> : null}
            {status.claudeDesktop.installed ? 'Update Claude Desktop' : 'Install in Claude Desktop'}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Claude Code, Cursor, and other agents"
        description="Any client that speaks MCP over Streamable HTTP can use this URL. Send the token as a Bearer header."
        flush
      >
        <SettingsRow label="Server URL" description="Streamable HTTP endpoint on this computer." stacked>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-muted px-2 py-1 text-xs">{status.url}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy(status.url, 'URL')}>
              <Copy />
              Copy URL
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow label="Claude Code" description="Run this in a terminal, then start a new Claude Code session." stacked>
          <div className="space-y-2">
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{status.claudeCode.command}</pre>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy(status.claudeCode.command, 'Command')}>
              <Copy />
              Copy command
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          label="Cursor and VS Code"
          description="Paste this into the MCP settings for Cursor, VS Code, or another HTTP client."
          stacked
        >
          <div className="space-y-2">
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{cursorConfig(status)}</pre>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy(cursorConfig(status), 'Config')}>
              <Copy />
              Copy config
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
