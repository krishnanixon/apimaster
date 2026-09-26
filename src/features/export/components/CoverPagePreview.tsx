import { cn } from '@/shared/lib/utils'
import { buildCoverCss, buildCoverHtml, EXPORT_COVER_STYLES } from '@shared/lib/export-cover'
import type { ExportCoverStyle } from '@shared/types'

export interface CoverPagePreviewProps {
  width: number
  height: number
  style: ExportCoverStyle
  accent: string
  heading1Color: string
  bg: string
  text: string
  muted: string
  fontFamily: string
  h1Size: number
  companyName: string
  companyLogo: string
  showLogo: boolean
  projectName: string
  title: string
  typeLabel: string
  subtitle: string
  preparedBy: string
  themeLabel: string
  dateLabel: string
  backgroundImage?: string
  overlay?: number
}

export function CoverPagePreview(props: CoverPagePreviewProps) {
  return (
    <div
      className="export-cover-host relative overflow-hidden rounded-sm shadow-lg ring-1 ring-black/5"
      style={{ width: props.width, height: props.height, background: props.bg }}
    >
      <style>{`${buildCoverCss()}
        .export-cover-host .cover { min-height: 100% !important; height: 100%; }
        .export-cover-host .classification-banner,
        .export-cover-host .cover-watermark { display: none !important; }
      `}</style>
      <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: buildCoverHtml(props) }} />
    </div>
  )
}

export function CoverStylePicker({
  value,
  accent,
  onChange
}: {
  value: ExportCoverStyle
  accent: string
  onChange: (style: ExportCoverStyle) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {EXPORT_COVER_STYLES.map((style) => (
        <button
          key={style.id}
          type="button"
          title={style.description}
          onClick={() => onChange(style.id)}
          className={cn(
            'rounded-lg border p-1.5 text-left transition-colors',
            value === style.id
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-border hover:bg-muted/70'
          )}
        >
          <CoverThumb styleId={style.id} accent={accent} active={value === style.id} />
          <span className="mt-1.5 block truncate text-center text-[10px] font-medium leading-tight">
            {style.label}
          </span>
        </button>
      ))}
    </div>
  )
}

function CoverThumb({
  styleId,
  accent,
  active
}: {
  styleId: ExportCoverStyle
  accent: string
  active: boolean
}) {
  const paper = active ? '#fff' : '#f8fafc'
  return (
    <span
      className="relative block h-14 overflow-hidden rounded-[4px] border border-black/10"
      style={{ background: paper }}
    >
      {styleId === 'minimal' && (
        <>
          <span className="absolute bottom-2 left-1.5 h-0.5 w-4 rounded-full" style={{ background: accent }} />
          <span className="absolute bottom-3.5 left-1.5 h-1.5 w-6 rounded-sm bg-slate-700/80" />
        </>
      )}
      {styleId === 'modern' && (
        <>
          <span className="absolute left-1/2 top-2 h-0.5 w-3 -translate-x-1/2 rounded-full" style={{ background: accent }} />
          <span className="absolute left-1/2 top-[18px] h-1.5 w-7 -translate-x-1/2 rounded-sm bg-slate-700/80" />
        </>
      )}
      {styleId === 'corporate' && (
        <span className="absolute inset-0" style={{ background: '#0f172a' }}>
          <span className="absolute left-1/2 top-2 h-0.5 w-3 -translate-x-1/2 rounded-full" style={{ background: accent }} />
          <span className="absolute left-1/2 top-[18px] h-1.5 w-6 -translate-x-1/2 rounded-sm bg-white/90" />
        </span>
      )}
      {styleId === 'split' && (
        <>
          <span className="absolute inset-y-0 left-0 w-[38%]" style={{ background: accent }} />
          <span className="absolute left-[46%] top-[18px] h-1.5 w-5 rounded-sm bg-slate-700/80" />
        </>
      )}
      {styleId === 'editorial' && (
        <>
          <span className="absolute inset-x-0 top-0 h-[32%]" style={{ background: accent }} />
          <span className="absolute bottom-2 left-1.5 h-1.5 w-6 rounded-sm bg-slate-700/80" />
        </>
      )}
      {styleId === 'classic' && (
        <>
          <span className="absolute left-1/2 top-3 h-px w-6 -translate-x-1/2" style={{ background: accent }} />
          <span className="absolute left-1/2 top-[17px] h-1.5 w-6 -translate-x-1/2 rounded-sm bg-slate-700/80" />
          <span className="absolute left-1/2 top-7 h-px w-6 -translate-x-1/2" style={{ background: accent }} />
        </>
      )}
      {styleId === 'bold' && (
        <span className="absolute inset-0" style={{ background: accent }}>
          <span className="absolute bottom-2 left-1.5 h-1.5 w-6 rounded-sm bg-white/90" />
        </span>
      )}
    </span>
  )
}
