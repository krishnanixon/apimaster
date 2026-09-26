import {
  FileText,
  FileType,
  FolderOpen,
  Info,
  LayoutTemplate,
  ListChecks,
  Settings2
} from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { SettingToggle } from '@/features/settings/components/SettingToggle'
import {
  OptionCards,
  SegmentedControl,
  SettingsGroup,
  SettingsNote,
  SettingsRow,
  SettingsSection
} from '@/features/settings/components/SettingsSection'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { Button } from '@/shared/components/ui/button'

const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF', hint: 'Print-ready, fixed layout', icon: FileText },
  { value: 'docx', label: 'DOCX', hint: 'Editable in Word', icon: FileType }
] as const

const PAGE_SIZE_OPTIONS = [
  { value: 'letter', label: 'Letter' },
  { value: 'a4', label: 'A4' }
] as const

const ORIENTATION_OPTIONS = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' }
] as const

const QUALITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'standard', label: 'Standard' },
  { value: 'compact', label: 'Compact' }
] as const

const QUALITY_HINT: Record<(typeof QUALITY_OPTIONS)[number]['value'], string> = {
  high: 'Sharpest images, largest files.',
  standard: 'Balanced quality and file size.',
  compact: 'Smallest files — good for email.'
}

export function ExportPanel() {
  const { settings, updateSettings } = useSettingsStore()

  const patch = (data: Partial<AppSettings>) => settings && updateSettings({ ...settings, ...data })

  const format = settings?.exportDefaultFormat === 'docx' ? 'docx' : 'pdf'
  const pageSize = settings?.exportPageSize === 'a4' ? 'a4' : 'letter'
  const orientation = settings?.exportOrientation === 'landscape' ? 'landscape' : 'portrait'
  const quality = settings?.exportImageQuality ?? 'standard'

  return (
    <SettingsSection>
      <SettingsGroup
        title="Format & destination"
        description="These defaults pre-fill the export dialog — you can still change them per export."
        icon={Settings2}
        flush
      >
        <SettingsRow label="Default format" stacked>
          <OptionCards
            ariaLabel="Default export format"
            value={format}
            options={FORMAT_OPTIONS}
            onChange={(value) => patch({ exportDefaultFormat: value })}
          />
        </SettingsRow>
        <SettingsRow
          label="Word save folder"
          description={
            settings?.exportFolderPath ? (
              <span
                className="block truncate font-mono text-[11px]"
                title={settings.exportFolderPath}
              >
                {settings.exportFolderPath}
              </span>
            ) : (
              'Generated documents are also saved here as .docx files. Not set yet.'
            )
          }
        >
          <div className="flex gap-2">
            {settings?.exportFolderPath ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void window.electronAPI.export.revealPath(settings.exportFolderPath)}
              >
                Open
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const result = await window.electronAPI.export.selectFolder()
                if (result.success && result.data) {
                  await updateSettings({ exportFolderPath: result.data })
                }
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {settings?.exportFolderPath ? 'Change' : 'Choose folder'}
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Page layout" icon={LayoutTemplate} flush>
        <SettingsRow
          label="Page size"
          description={pageSize === 'a4' ? 'ISO 210 × 297 mm' : 'US 8.5 × 11 in'}
        >
          <SegmentedControl
            ariaLabel="Page size"
            value={pageSize}
            options={PAGE_SIZE_OPTIONS}
            onChange={(value) => patch({ exportPageSize: value })}
          />
        </SettingsRow>
        <SettingsRow
          label="Orientation"
          description={orientation === 'portrait' ? 'Tall page' : 'Wide page'}
        >
          <SegmentedControl
            ariaLabel="Orientation"
            value={orientation}
            options={ORIENTATION_OPTIONS}
            onChange={(value) => patch({ exportOrientation: value })}
          />
        </SettingsRow>
        <SettingsRow label="Image quality" description={QUALITY_HINT[quality]}>
          <SegmentedControl
            ariaLabel="Image quality"
            value={quality}
            options={QUALITY_OPTIONS}
            onChange={(value) => patch({ exportImageQuality: value })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Include in exports"
        description="Choose which elements are added to every exported document."
        icon={ListChecks}
        flush
      >
        <SettingToggle
          label="Cover page"
          description="Title page with project name and document type."
          checked={settings?.exportIncludeCoverPage ?? true}
          onChange={(v) => patch({ exportIncludeCoverPage: v })}
        />
        <SettingToggle
          label="Company logo on cover"
          description="Uses the logo from project settings when one is uploaded."
          checked={settings?.exportIncludeLogo ?? true}
          disabled={!(settings?.exportIncludeCoverPage ?? true)}
          onChange={(v) => patch({ exportIncludeLogo: v })}
        />
        <SettingToggle
          label="Table of contents"
          description="Auto-generated from document headings."
          checked={settings?.exportIncludeTableOfContents ?? true}
          onChange={(v) => patch({ exportIncludeTableOfContents: v })}
        />
        <SettingToggle
          label="Page numbers"
          description="Numbered pages in the footer."
          checked={settings?.exportIncludePageNumbers ?? true}
          onChange={(v) => patch({ exportIncludePageNumbers: v })}
        />
        <SettingToggle
          label="Headers & footers"
          description="Project name and document title on each page."
          checked={settings?.exportIncludeHeaderFooter ?? true}
          onChange={(v) => patch({ exportIncludeHeaderFooter: v })}
        />
        <SettingToggle
          label="Watermark"
          description="Diagonal confidential or draft mark on every page."
          checked={settings?.exportIncludeWatermark ?? false}
          onChange={(v) => patch({ exportIncludeWatermark: v })}
        />
        <SettingToggle
          label="Classification banner"
          description="Confidential label at the top of each exported page."
          checked={(settings?.exportClassification ?? 'none') !== 'none'}
          onChange={(v) => patch({ exportClassification: v ? 'confidential' : 'none' })}
        />
      </SettingsGroup>

      <SettingsNote icon={Info} title="Good to know">
        Cover photo, typeface, overlay, and PDF password are set in the export preview. Markdown,
        HTML, and JSON exports use the raw document content and ignore these options. Flow diagrams
        export as PNG, SVG, Mermaid, or JSON from the flow toolbar.
      </SettingsNote>
    </SettingsSection>
  )
}
