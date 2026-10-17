import { describe, expect, it } from 'vitest'
import {
  activityLevel,
  buildActivityCalendar,
  computeStreaks,
  incrementActivity,
  localDateKey,
  normalizeActivityLog,
  pruneActivity
} from '@shared/lib/activity-calendar'
import {
  applyProfilePatch,
  emptyProfile,
  isLikelyEmail,
  normalizeProfile,
  profileInitials,
  toWebsiteUrl
} from '@shared/lib/profile'

// Sunday, 27 Sep 2026 (local time)
const today = new Date(2026, 8, 27, 15, 30)

describe('activity log', () => {
  it('increments counts per local day and kind', () => {
    let log = incrementActivity({ days: {} }, 'request', today)
    log = incrementActivity(log, 'request', today)
    log = incrementActivity(log, 'ai', today)
    expect(log.days['2026-09-27']).toEqual({ request: 2, ai: 1 })
  })

  it('drops days past retention', () => {
    const log = pruneActivity({ days: { '2024-01-01': { request: 3 }, '2026-09-20': { test: 1 } } }, today)
    expect(Object.keys(log.days)).toEqual(['2026-09-20'])
  })

  it('normalizes untrusted data from disk', () => {
    expect(
      normalizeActivityLog({
        days: { '2026-09-01': { request: 2.7, ai: -1, bogus: 4 }, nope: { request: 1 }, '2026-09-02': {} }
      })
    ).toEqual({ days: { '2026-09-01': { request: 2 } } })
    expect(normalizeActivityLog('garbage')).toEqual({ days: {} })
  })

  it('buckets counts into quartile levels', () => {
    expect(activityLevel(0, 10)).toBe(0)
    expect(activityLevel(1, 10)).toBe(1)
    expect(activityLevel(5, 10)).toBe(2)
    expect(activityLevel(10, 10)).toBe(4)
  })
})

describe('activity calendar', () => {
  const log = {
    days: {
      '2026-09-27': { request: 4, ai: 1 },
      '2026-09-26': { request: 1 },
      '2026-09-25': { test: 2 },
      '2026-09-20': { mock: 1 }
    }
  }

  it('lays out 53 Sunday-first weeks ending today', () => {
    const cal = buildActivityCalendar(log, { today })
    expect(cal.weeks).toHaveLength(53)
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true)
    // Start is a Sunday; today (a Sunday) opens the last column, the rest is padding
    expect(new Date(cal.start + 'T00:00').getDay()).toBe(0)
    expect(cal.end).toBe(localDateKey(today))
    expect(cal.weeks[52][0]?.date).toBe('2026-09-27')
    expect(cal.weeks[52].slice(1).every((c) => c === null)).toBe(true)
    expect(cal.weeks[51][6]?.date).toBe('2026-09-26')
  })

  it('totals, filters, and finds the busiest day', () => {
    const all = buildActivityCalendar(log, { today })
    expect(all.total).toBe(9)
    expect(all.activeDays).toBe(4)
    expect(all.busiest?.date).toBe('2026-09-27')
    expect(all.byKind).toEqual({ request: 5, test: 2, ai: 1, mock: 1 })

    const tests = buildActivityCalendar(log, { today, filter: 'test' })
    expect(tests.total).toBe(2)
    expect(tests.busiest?.date).toBe('2026-09-25')
  })

  it('pads days after today with null', () => {
    const wednesday = new Date(2026, 8, 23)
    const cal = buildActivityCalendar({ days: {} }, { today: wednesday })
    const last = cal.weeks[cal.weeks.length - 1]
    expect(last[3]?.date).toBe('2026-09-23')
    expect(last.slice(4)).toEqual([null, null, null])
    expect(cal.busiest).toBeNull()
  })

  it('labels months without overlapping', () => {
    const cal = buildActivityCalendar({ days: {} }, { today })
    for (let i = 1; i < cal.months.length; i++) {
      expect(cal.months[i].week - cal.months[i - 1].week).toBeGreaterThanOrEqual(3)
    }
    expect(cal.months[cal.months.length - 1].label).toBe('Sep')
  })
})

describe('streaks', () => {
  it('counts the current streak through today', () => {
    const log = { days: { '2026-09-27': { request: 1 }, '2026-09-26': { ai: 1 }, '2026-09-25': { test: 1 } } }
    expect(computeStreaks(log, { today })).toEqual({ current: 3, longest: 3 })
  })

  it('keeps yesterday’s streak alive until today ends', () => {
    const log = { days: { '2026-09-26': { request: 1 }, '2026-09-25': { request: 1 } } }
    expect(computeStreaks(log, { today }).current).toBe(2)
  })

  it('finds the longest run anywhere in the log', () => {
    const log = {
      days: {
        '2026-03-01': { request: 1 },
        '2026-03-02': { request: 1 },
        '2026-03-03': { request: 1 },
        '2026-03-04': { request: 1 },
        '2026-09-20': { request: 1 }
      }
    }
    expect(computeStreaks(log, { today })).toEqual({ current: 0, longest: 4 })
  })

  it('handles month boundaries', () => {
    const log = { days: { '2026-08-31': { ai: 1 }, '2026-09-01': { ai: 1 } } }
    expect(computeStreaks(log, { today }).longest).toBe(2)
  })
})

describe('profile', () => {
  it('trims and clamps fields', () => {
    const p = normalizeProfile({ displayName: '  Ada  ', bio: 'x'.repeat(500), role: 42 })
    expect(p.displayName).toBe('Ada')
    expect(p.bio).toHaveLength(280)
    expect(p.role).toBe('')
  })

  it('only accepts image data URLs as avatars', () => {
    expect(normalizeProfile({ avatarDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }).avatarDataUrl).toBe(
      'data:image/png;base64,iVBORw0KGgo='
    )
    expect(normalizeProfile({ avatarDataUrl: 'https://evil.example/x.png' }).avatarDataUrl).toBeNull()
    expect(normalizeProfile({ avatarDataUrl: 'data:text/html;base64,PGh0bWw+' }).avatarDataUrl).toBeNull()
  })

  it('keeps createdAt when patching', () => {
    const base = emptyProfile('2026-01-01T00:00:00.000Z')
    const next = applyProfilePatch(base, { displayName: 'Grace' }, '2026-09-27T00:00:00.000Z')
    expect(next.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(next.updatedAt).toBe('2026-09-27T00:00:00.000Z')
    expect(next.displayName).toBe('Grace')
  })

  it('derives initials', () => {
    expect(profileInitials('ada lovelace')).toBe('AL')
    expect(profileInitials('Grace Brewster Hopper')).toBe('GH')
    expect(profileInitials('  ')).toBe('')
  })

  it('validates website and email', () => {
    expect(toWebsiteUrl('github.com/me')).toBe('https://github.com/me')
    expect(toWebsiteUrl('javascript:alert(1)')).toBeNull()
    expect(toWebsiteUrl('')).toBeNull()
    expect(isLikelyEmail('')).toBe(true)
    expect(isLikelyEmail('a@b.co')).toBe(true)
    expect(isLikelyEmail('nope')).toBe(false)
  })
})
