import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Info, Lightbulb, AlertTriangle, ChevronRight } from 'lucide-react'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'
import { DOC_SECTIONS, DOC_GROUP_ORDER, type DocBlock, type DocSection } from '../data/docs-content'
import { PRODUCT_NAME } from '@shared/constants/product'

function matchesQuery(section: DocSection, query: string): boolean {
  if (!query.trim()) return true
  const haystack = [
    section.title,
    section.summary,
    ...section.blocks.flatMap((b) => {
      switch (b.kind) {
        case 'text':
        case 'subheading':
          return [b.text]
        case 'list':
          return b.items
        case 'steps':
          return b.items.flatMap((i) => [i.title, i.detail ?? ''])
        case 'callout':
          return [b.title ?? '', b.text]
        case 'table':
          return b.rows.flatMap((r) => [r.label, r.value])
        default:
          return []
      }
    })
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

export function DocumentationPage() {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string>(DOC_SECTIONS[0]?.id ?? '')
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const visibleSections = useMemo(
    () => DOC_SECTIONS.filter((s) => matchesQuery(s, query)),
    [query]
  )

  const groupedNav = useMemo(() => {
    return DOC_GROUP_ORDER.map((group) => ({
      group,
      sections: visibleSections.filter((s) => s.group === group)
    })).filter((g) => g.sections.length > 0)
  }, [visibleSections])

  // Scroll-spy: highlight the section currently in view.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id)
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    )
    visibleSections.forEach((s) => {
      const el = sectionRefs.current[s.id]
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [visibleSections])

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveId(id)
    }
  }

  return (
    <ModulePage>
      <PageHeader
        title="Documentation"
        description={`Complete guide to ${PRODUCT_NAME} — the workflow, every module, the architecture, and how to use it all.`}
      />

      <PageContent fullBleed>
      <div className="flex min-h-0 flex-1">
        {/* On this page navigation */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background lg:flex">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search docs..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-3">
            {groupedNav.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">No matching topics.</p>
            ) : (
              groupedNav.map(({ group, sections }) => (
                <div key={group} className="mb-5">
                  <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {sections.map((s) => {
                      const Icon = s.icon
                      const active = s.id === activeId
                      return (
                        <button
                          key={s.id}
                          onClick={() => scrollToSection(s.id)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                            active
                              ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 opacity-80" />
                          <span className="truncate">{s.navLabel ?? s.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </nav>
        </aside>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-8 md:px-10">
          <div className="mx-auto w-full max-w-3xl">
            {/* Mobile search */}
            <div className="relative mb-6 lg:hidden">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search docs..."
                className="pl-9"
              />
            </div>

            {visibleSections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  No topics match “{query}”. Try a different search.
                </p>
              </div>
            ) : (
              <div className="space-y-14">
                {visibleSections.map((section) => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    registerRef={(el) => (sectionRefs.current[section.id] = el)}
                  />
                ))}
              </div>
            )}

            <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
              {PRODUCT_NAME} · This guide is built into the app and reflects the current
              flow, design, and structure.
            </footer>
          </div>
        </div>
      </div>
      </PageContent>
    </ModulePage>
  )
}

function SectionBlock({
  section,
  registerRef
}: {
  section: DocSection
  registerRef: (el: HTMLElement | null) => void
}) {
  const Icon = section.icon
  return (
    <section
      id={section.id}
      ref={registerRef}
      className="scroll-mt-6"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {section.title}
            </h2>
            <Badge variant="outline" className="font-normal">
              {section.group}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.summary}</p>
        </div>
      </div>

      <div className="space-y-4 pl-0 sm:pl-[52px]">
        {section.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>
    </section>
  )
}

const CALLOUT_META = {
  info: { icon: Info, className: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100', iconClass: 'text-blue-600 dark:text-blue-400' },
  tip: { icon: Lightbulb, className: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100', iconClass: 'text-emerald-600 dark:text-emerald-400' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100', iconClass: 'text-amber-600 dark:text-amber-400' }
} as const

function BlockRenderer({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case 'text':
      return <p className="text-sm leading-relaxed text-foreground/90">{block.text}</p>

    case 'subheading':
      return (
        <h3 className="pt-2 text-sm font-semibold tracking-tight text-foreground">{block.text}</h3>
      )

    case 'list':
      return (
        <ul className="space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/90">
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )

    case 'steps':
      return (
        <ol className="space-y-3">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {item.detail && (
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {item.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )

    case 'callout': {
      const meta = CALLOUT_META[block.tone]
      const CalloutIcon = meta.icon
      return (
        <div className={cn('flex gap-3 rounded-xl border p-3.5', meta.className)}>
          <CalloutIcon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} />
          <div className="min-w-0 text-sm leading-relaxed">
            {block.title && <p className="font-semibold">{block.title}</p>}
            <p className={cn(block.title && 'mt-0.5', 'opacity-90')}>{block.text}</p>
          </div>
        </div>
      )
    }

    case 'table':
      return (
        <div className="overflow-hidden rounded-xl border border-border">
          {block.caption && (
            <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              {block.caption}
            </div>
          )}
          <dl className="divide-y divide-border">
            {block.rows.map((row, i) => (
              <div key={i} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
                <dt className="text-sm font-medium text-foreground">{row.label}</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )

    default:
      return null
  }
}
