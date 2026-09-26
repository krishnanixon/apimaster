import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ARCH_NAV_GROUPS, ARCH_SECTIONS } from '@shared/lib/architecture-catalog'
import type { ArchSectionId } from '@shared/types/architecture'
import { DynamicIcon } from '../lib/dynamic-icon'
import { cn } from '@/shared/lib/utils'

interface WorkspaceNavProps {
  activeSection: ArchSectionId
  onSelect: (section: ArchSectionId) => void
  /** Per-section counts shown as a trailing badge. */
  counts: Partial<Record<ArchSectionId, number>>
}

const SECTION_INDEX = new Map(ARCH_SECTIONS.map((section) => [section.id, section]))

export function WorkspaceNav({ activeSection, onSelect, counts }: WorkspaceNavProps) {
  const activeGroupId = useMemo(
    () => ARCH_NAV_GROUPS.find((group) => group.sections.includes(activeSection))?.id,
    [activeSection]
  )

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      ARCH_NAV_GROUPS.map((group) => [group.id, group.collapsible ? false : true])
    )
  )

  // Keep the group that owns the active section expanded so deep links stay visible.
  useEffect(() => {
    if (!activeGroupId) return
    setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }))
  }, [activeGroupId])

  return (
    <nav
      aria-label="Architecture workspace sections"
      className="flex h-full flex-col overflow-y-auto border-r border-border/70 bg-muted/20 py-2 dark:bg-background"
    >
      <div className="flex flex-col gap-3 px-1.5">
        {ARCH_NAV_GROUPS.map((group) => {
          const isOpen = openGroups[group.id] ?? true
          const showItems = !group.collapsible || isOpen

          return (
            <div key={group.id}>
              {group.collapsible ? (
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                  }
                  className="mb-1 flex w-full items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  aria-expanded={isOpen}
                >
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 transition-transform duration-fast',
                      isOpen ? 'rotate-0' : '-rotate-90'
                    )}
                  />
                </button>
              ) : (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}

              {showItems && (
                <ul className="flex flex-col gap-px">
                  {group.sections.map((sectionId) => {
                    const section = SECTION_INDEX.get(sectionId)
                    if (!section) return null
                    const isActive = section.id === activeSection
                    const count = counts[section.id]

                    return (
                      <li key={section.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(section.id)}
                          aria-current={isActive ? 'page' : undefined}
                          title={section.description}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]',
                            'transition-colors duration-fast ease-out',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                            isActive
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'
                          )}
                        >
                          <DynamicIcon name={section.icon} className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{section.label}</span>
                          {count !== undefined && count > 0 && (
                            <span
                              className={cn(
                                'ml-auto shrink-0 text-[10px] tabular-nums',
                                isActive ? 'text-primary/70' : 'text-muted-foreground/70'
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
