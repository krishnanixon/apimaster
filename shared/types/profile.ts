/** Local user profile — stored on this device only, never uploaded. */
export interface UserProfile {
  displayName: string
  email: string
  role: string
  bio: string
  location: string
  website: string
  /** Square avatar as a `data:image/...;base64,` URL, or null for initials */
  avatarDataUrl: string | null
  createdAt: string
  updatedAt: string
}

export type UserProfilePatch = Partial<Omit<UserProfile, 'createdAt' | 'updatedAt'>>

/** Things that count as a contribution on the activity calendar. */
export type ActivityKind = 'request' | 'test' | 'ai' | 'mock'

export type ActivityCounts = Partial<Record<ActivityKind, number>>

/** Per-day activity counts, keyed by local date (YYYY-MM-DD). */
export interface ActivityLog {
  days: Record<string, ActivityCounts>
}
