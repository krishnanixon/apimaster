import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import type { DbWorkspaceSettings } from '@shared/types/database-workspace'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'

interface DbWorkspaceSettingsPanelProps {
  /** When false, omits the save button (parent handles save). */
  showSaveButton?: boolean
  onSaved?: () => void
}

type WorkspacePrefs = Omit<DbWorkspaceSettings, 'defaultConnection' | 'defaultConnectionPasswordEnc'>

function toWorkspacePrefs(settings: DbWorkspaceSettings): WorkspacePrefs {
  const { defaultConnection: _dc, defaultConnectionPasswordEnc: _enc, ...prefs } = settings
  return prefs
}

export function DbWorkspaceSettingsPanel({ showSaveButton = true, onSaved }: DbWorkspaceSettingsPanelProps) {
  const settings = useDbWorkspaceStore((s) => s.settings)
  const loadSettings = useDbWorkspaceStore((s) => s.loadSettings)
  const saveSettings = useDbWorkspaceStore((s) => s.saveSettings)
  const [local, setLocal] = useState<WorkspacePrefs>(() => toWorkspacePrefs(settings))
  const isDirtyRef = useRef(false)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (!isDirtyRef.current) {
      setLocal(toWorkspacePrefs(settings))
    }
  }, [settings])

  const markDirty = (patch: Partial<WorkspacePrefs>) => {
    isDirtyRef.current = true
    setLocal((s) => ({ ...s, ...patch }))
  }

  const handleSave = async () => {
    await saveSettings(local)
    isDirtyRef.current = false
    onSaved?.()
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Query timeout (ms)</label>
          <Input
            type="number"
            value={local.queryTimeoutMs}
            onChange={(e) => markDirty({ queryTimeoutMs: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Max rows</label>
          <Input
            type="number"
            value={local.maxRows}
            onChange={(e) => markDirty({ maxRows: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Editor font size</label>
          <Input
            type="number"
            value={local.editorFontSize}
            onChange={(e) => markDirty({ editorFontSize: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Query history limit</label>
          <Input
            type="number"
            value={local.queryHistoryLimit}
            onChange={(e) => markDirty({ queryHistoryLimit: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Grid density</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            value={local.gridDensity}
            onChange={(e) =>
              markDirty({ gridDensity: e.target.value as DbWorkspaceSettings['gridDensity'] })
            }
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Default export format</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            value={local.defaultExportFormat}
            onChange={(e) =>
              markDirty({
                defaultExportFormat: e.target.value as DbWorkspaceSettings['defaultExportFormat']
              })
            }
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="sql">SQL</option>
            <option value="xlsx">Excel</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">SQL formatter dialect</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            value={local.sqlFormatterDialect}
            onChange={(e) => markDirty({ sqlFormatterDialect: e.target.value })}
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
            <option value="tsql">SQL Server</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Default schema</label>
          <Input
            value={local.defaultSchema}
            onChange={(e) => markDirty({ defaultSchema: e.target.value })}
            placeholder="public"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Connection pool max</label>
          <Input
            type="number"
            value={local.connectionPoolMax}
            onChange={(e) => markDirty({ connectionPoolMax: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="divide-y divide-border/60 rounded-xl border border-border/50 p-4">
        {(
          [
            ['autoReconnect', 'Auto reconnect', 'Reconnect automatically when a session drops.'],
            ['autoCommit', 'Auto commit', 'Commit each statement without an explicit transaction.'],
            ['autoSave', 'Auto save grid edits', 'Save data grid changes without clicking Save.'],
            ['aiEnabled', 'AI assistant', 'Enable AI analysis and code generation in Database Workbench.'],
            ['confirmDestructiveQueries', 'Confirm destructive SQL', 'Require confirmation before DROP or TRUNCATE.'],
            ['resultCacheEnabled', 'Result cache', 'Cache recent query results for faster re-display.']
          ] as const
        ).map(([key, label, description]) => (
          <label key={key} className="flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={local[key]}
              onChange={(e) => markDirty({ [key]: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="text-[11px] text-muted-foreground">{description}</span>
            </span>
          </label>
        ))}
      </div>

      {showSaveButton && (
        <Button className="w-fit" onClick={() => void handleSave()}>
          Save workspace settings
        </Button>
      )}
    </div>
  )
}
