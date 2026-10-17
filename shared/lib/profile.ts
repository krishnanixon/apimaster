import type { UserProfile, UserProfilePatch } from '../types/profile'

export const PROFILE_LIMITS = {
  displayName: 60,
  email: 120,
  role: 80,
  bio: 280,
  location: 80,
  website: 200,
  /** ~512 KB of base64 — plenty for a 256px avatar */
  avatarDataUrl: 700_000
} as const

const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/

export function emptyProfile(now = new Date().toISOString()): UserProfile {
  return {
    displayName: '',
    email: '',
    role: '',
    bio: '',
    location: '',
    website: '',
    avatarDataUrl: null,
    createdAt: now,
    updatedAt: now
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function avatar(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length > PROFILE_LIMITS.avatarDataUrl || !AVATAR_PATTERN.test(value)) return null
  return value
}

function isoDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback
}

/** Coerces anything read from disk or IPC into a valid profile. */
export function normalizeProfile(raw: unknown, now = new Date().toISOString()): UserProfile {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    displayName: text(source.displayName, PROFILE_LIMITS.displayName),
    email: text(source.email, PROFILE_LIMITS.email),
    role: text(source.role, PROFILE_LIMITS.role),
    bio: text(source.bio, PROFILE_LIMITS.bio),
    location: text(source.location, PROFILE_LIMITS.location),
    website: text(source.website, PROFILE_LIMITS.website),
    avatarDataUrl: avatar(source.avatarDataUrl),
    createdAt: isoDate(source.createdAt, now),
    updatedAt: isoDate(source.updatedAt, now)
  }
}

export function applyProfilePatch(
  current: UserProfile,
  patch: UserProfilePatch,
  now = new Date().toISOString()
): UserProfile {
  return normalizeProfile({ ...current, ...patch, createdAt: current.createdAt, updatedAt: now }, now)
}

/** Up to two initials for the avatar fallback. */
export function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Adds a scheme so "example.com" becomes a clickable link; rejects non-http(s) URLs. */
export function toWebsiteUrl(website: string): string | null {
  const value = website.trim()
  if (!value) return null
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function isLikelyEmail(email: string): boolean {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
