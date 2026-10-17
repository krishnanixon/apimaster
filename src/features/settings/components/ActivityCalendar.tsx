import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
  parseDateKey,
  type ActivityCalendar as CalendarData,
  type CalendarCell
} from '@shared/lib/activity-calendar'
import { cn } from '@/shared/lib/utils'

const CELL = 11
const GAP = 3
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

const LEVEL_CLASSES = [
  'bg-muted ring-1 ring-inset ring-foreground/[0.06]',
  'bg-primary/25',
  'bg-primary/45',
  'bg-primary/70',
  'bg-primary'
] as const

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

function formatDay(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

interface HoverState {
  cell: CalendarCell
  x: number
  y: number
}

export function ActivityCalendar({
  data,
  unit = { one: 'contribution', many: 'contributions' }
}: {
  data: CalendarData
  unit?: { one: string; many: string }
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

  // Most recent weeks sit on the right; show them first on narrow widths
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const onEnter = (cell: CalendarCell) => (e: MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current?.getBoundingClientRect()
    const rect = e.currentTarget.getBoundingClientRect()
    if (!wrap) return
    const center = rect.left - wrap.left + rect.width / 2
    // Keep the tooltip inside the card near the first and last weeks
    const x = Math.min(Math.max(center, 120), Math.max(120, wrap.width - 120))
    setHover({ cell, x, y: rect.top - wrap.top })
  }

  const gridWidth = data.weeks.length * (CELL + GAP) - GAP

  return (
    <div ref={wrapRef} className="relative">
      <div ref={scrollRef} className="overflow-x-auto pb-1" onMouseLeave={() => setHover(null)}>
        <div className="inline-flex gap-2" style={{ minWidth: gridWidth + 32 }}>
          {/* Weekday labels */}
          <div
            className="grid shrink-0 pt-[18px] text-[10px] leading-none text-muted-foreground"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}
            aria-hidden
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i} className="flex items-center">
                {label}
              </span>
            ))}
          </div>

          <div>
            {/* Month labels */}
            <div className="relative mb-[6px] h-3 text-[10px] leading-none text-muted-foreground" aria-hidden>
              {data.months.map((m) => (
                <span key={`${m.label}-${m.week}`} className="absolute top-0" style={{ left: m.week * (CELL + GAP) }}>
                  {m.label}
                </span>
              ))}
            </div>

            <div
              role="img"
              aria-label={`${plural(data.total, unit.one, unit.many)} in the last year`}
              className="grid grid-flow-col"
              style={{
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gridAutoColumns: `${CELL}px`,
                gap: GAP
              }}
            >
              {data.weeks.flatMap((week, w) =>
                week.map((cell, d) =>
                  cell ? (
                    <div
                      key={cell.date}
                      onMouseEnter={onEnter(cell)}
                      className={cn(
                        'rounded-[3px] transition-[transform,box-shadow] duration-100 hover:scale-125 hover:shadow-sm',
                        LEVEL_CLASSES[cell.level]
                      )}
                    />
                  ) : (
                    <div key={`pad-${w}-${d}`} />
                  )
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {hover && <CalendarTooltip hover={hover} unit={unit} />}
    </div>
  )
}

function CalendarTooltip({ hover, unit }: { hover: HoverState; unit: { one: string; many: string } }) {
  const { cell } = hover
  const parts = ACTIVITY_KINDS.filter((kind) => (cell.counts[kind] ?? 0) > 0)
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] text-background shadow-float"
      style={{ left: hover.x, top: hover.y - 6 }}
    >
      <p>
        <span className="font-semibold">
          {cell.count ? plural(cell.count, unit.one, unit.many) : `No ${unit.many}`}
        </span>{' '}
        on {formatDay(cell.date)}
      </p>
      {parts.length > 1 && (
        <p className="mt-0.5 opacity-70">
          {parts
            .map((kind) =>
              plural(cell.counts[kind] ?? 0, ACTIVITY_KIND_LABELS[kind].one, ACTIVITY_KIND_LABELS[kind].many)
            )
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

export function CalendarLegend() {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground" aria-hidden>
      <span className="mr-1">Less</span>
      {LEVEL_CLASSES.map((cls, i) => (
        <span key={i} className={cn('rounded-[3px]', cls)} style={{ width: CELL, height: CELL }} />
      ))}
      <span className="ml-1">More</span>
    </div>
  )
}
