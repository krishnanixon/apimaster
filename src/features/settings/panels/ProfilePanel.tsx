import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Activity,
  CalendarDays,
  Camera,
  Flame,
  Globe,
  HardDrive,
  Mail,
  MapPin,
  Trash2,
  Trophy,
  UserRound,
  Zap
} from 'lucide-react'
import type { ActivityKind, UserProfile, UserProfilePatch } from '@shared/types'
import {
  PROFILE_LIMITS,
  isLikelyEmail,
  toWebsiteUrl
} from '@shared/lib/profile'
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
  buildActivityCalendar,
  computeStreaks,
  parseDateKey,
  type ActivityFilter
} from '@shared/lib/activity-calendar'
import {
  SegmentedControl,
  SettingsGroup,
  SettingsSection
} from '@/features/settings/components/SettingsSection'
import { ActivityCalendar, CalendarLegend } from '@/features/settings/components/ActivityCalendar'
import { UserAvatar } from '@/features/settings/components/UserAvatar'
import { useProfileStore } from '@/features/settings/stores/profile.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import { cn } from '@/shared/lib/utils'

type Draft = Required<Omit<UserProfilePatch, 'avatarDataUrl'>> & { avatarDataUrl: string | null }

const TEXT_FIELDS = ['displayName', 'role', 'email', 'location', 'website', 'bio'] as const

function toDraft(profile: UserProfile): Draft {
  return {
    displayName: profile.displayName,
    role: profile.role,
    email: profile.email,
    location: profile.location,
    website: profile.website,
    bio: profile.bio,
    avatarDataUrl: profile.avatarDataUrl
  }
}

const FILTER_OPTIONS: ReadonlyArray<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'request', label: 'Requests' },
  { value: 'test', label: 'Tests' },
  { value: 'ai', label: 'AI' },
  { value: 'mock', label: 'Mocks' }
]

const KIND_TITLES: Record<ActivityKind, string> = {
  request: 'Requests sent',
  test: 'Test runs',
  ai: 'AI calls',
  mock: 'Mock servers'
}

const KIND_BAR_CLASSES: Record<ActivityKind, string> = {
  request: 'bg-primary',
  test: 'bg-emerald-500',
  ai: 'bg-violet-500',
  mock: 'bg-amber-500'
}

export function ProfilePanel() {
  const { profile, activity, loaded, loadProfile, loadActivity } = useProfileStore()

  useEffect(() => {
    void loadProfile()
    void loadActivity()
  }, [loadProfile, loadActivity])

  if (!loaded) {
    return (
      <SettingsSection>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </SettingsSection>
    )
  }

  if (!profile) {
    return (
      <SettingsSection>
        <p className="text-sm text-muted-foreground">
          Your profile couldn’t be loaded. Restart the app and try again.
        </p>
      </SettingsSection>
    )
  }

  return <ProfileEditor profile={profile} activityDays={activity?.days ?? {}} />
}

function ProfileEditor({
  profile,
  activityDays
}: {
  profile: UserProfile
  activityDays: Record<string, Partial<Record<ActivityKind, number>>>
}) {
  const updateProfile = useProfileStore((s) => s.updateProfile)
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile))
  const [saving, setSaving] = useState(false)

  // Pick up external changes (e.g. first load) without clobbering unsaved edits
  const savedKey = profile.updatedAt
  const lastSavedKey = useRef(savedKey)
  useEffect(() => {
    if (lastSavedKey.current !== savedKey) {
      lastSavedKey.current = savedKey
      setDraft(toDraft(profile))
    }
  }, [savedKey, profile])

  const dirty =
    TEXT_FIELDS.some((key) => draft[key].trim() !== profile[key]) ||
    draft.avatarDataUrl !== profile.avatarDataUrl

  const emailError = !isLikelyEmail(draft.email.trim()) ? 'Enter a valid email address' : null
  const websiteError =
    draft.website.trim() && !toWebsiteUrl(draft.website) ? 'Enter a valid http(s) URL' : null
  const canSave = dirty && !emailError && !websiteError && !saving

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const ok = await updateProfile(draft)
    setSaving(false)
    if (ok) toast.success('Profile saved')
    else toast.error('Couldn’t save your profile')
  }

  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <SettingsSection>
      <ProfileHero draft={draft} createdAt={profile.createdAt} onAvatar={(v) => set('avatarDataUrl', v)} />

      <ActivitySection days={activityDays} />

      <SettingsGroup
        title="Profile details"
        description="Shown on this device only — used to personalize the app."
        icon={UserRound}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" hint={`${draft.displayName.length}/${PROFILE_LIMITS.displayName}`}>
            <Input
              value={draft.displayName}
              maxLength={PROFILE_LIMITS.displayName}
              placeholder="Ada Lovelace"
              autoComplete="name"
              onChange={(e) => set('displayName', e.target.value)}
            />
          </Field>
          <Field label="Role or title">
            <Input
              value={draft.role}
              maxLength={PROFILE_LIMITS.role}
              placeholder="Backend engineer"
              autoComplete="organization-title"
              onChange={(e) => set('role', e.target.value)}
            />
          </Field>
          <Field label="Email" error={emailError}>
            <Input
              type="email"
              value={draft.email}
              maxLength={PROFILE_LIMITS.email}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!emailError}
              className={cn(emailError && 'border-destructive/60')}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
          <Field label="Location">
            <Input
              value={draft.location}
              maxLength={PROFILE_LIMITS.location}
              placeholder="Berlin, Germany"
              onChange={(e) => set('location', e.target.value)}
            />
          </Field>
          <Field label="Website" error={websiteError} className="sm:col-span-2">
            <Input
              value={draft.website}
              maxLength={PROFILE_LIMITS.website}
              placeholder="github.com/you"
              autoComplete="url"
              aria-invalid={!!websiteError}
              className={cn(websiteError && 'border-destructive/60')}
              onChange={(e) => set('website', e.target.value)}
            />
          </Field>
          <Field label="Bio" hint={`${draft.bio.length}/${PROFILE_LIMITS.bio}`} className="sm:col-span-2">
            <Textarea
              rows={3}
              value={draft.bio}
              maxLength={PROFILE_LIMITS.bio}
              placeholder="A line or two about what you build."
              className="resize-none"
              onChange={(e) => set('bio', e.target.value)}
            />
          </Field>
        </div>
      </SettingsGroup>

      <PrivacyGroup />

      {/* Sticky save bar — only while there is something to save */}
      <div
        className={cn(
          'sticky bottom-4 z-10 transition-all duration-200',
          dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        )}
        aria-hidden={!dirty}
      >
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/95 px-4 py-2.5 shadow-float backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <p className="flex-1 text-sm">You have unsaved changes</p>
          <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(profile))} disabled={saving} tabIndex={dirty ? 0 : -1}>
            Discard
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canSave} tabIndex={dirty ? 0 : -1}>
            {saving ? 'Saving…' : 'Save profile'}
            <kbd className="ml-1 hidden rounded bg-primary-foreground/15 px-1 font-sans text-[10px] sm:inline">⌘S</kbd>
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

function Field({
  label,
  hint,
  error,
  className,
  children
}: {
  label: string
  hint?: string
  error?: string | null
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="flex items-baseline justify-between gap-2 text-xs font-medium">
        {label}
        {hint && <span className="font-normal tabular-nums text-muted-foreground">{hint}</span>}
      </span>
      {children}
      {error && <span className="block text-[11px] text-destructive">{error}</span>}
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

const AVATAR_SIZE = 256

/** Center-crops and downsizes an image so the stored avatar stays small. */
function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = AVATAR_SIZE
      canvas.height = AVATAR_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable'))
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_SIZE,
        AVATAR_SIZE
      )
      const webp = canvas.toDataURL('image/webp', 0.86)
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file isn’t a readable image'))
    }
    img.src = url
  })
}

function ProfileHero({
  draft,
  createdAt,
  onAvatar
}: {
  draft: Draft
  createdAt: string
  onAvatar: (value: string | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const name = draft.displayName.trim()
  const website = toWebsiteUrl(draft.website)
  const memberSince = new Date(createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a PNG, JPEG, WebP, or GIF image')
      return
    }
    try {
      onAvatar(await resizeAvatar(file))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t read that image')
    }
  }

  const meta = [
    draft.email.trim() && { icon: Mail, text: draft.email.trim() },
    draft.location.trim() && { icon: MapPin, text: draft.location.trim() },
    { icon: CalendarDays, text: `Member since ${memberSince}` }
  ].filter(Boolean) as Array<{ icon: typeof Mail; text: string }>

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft">
      <div className="relative h-24 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent">
        <div
          className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(hsl(var(--primary)/0.35)_1px,transparent_1px)] [background-size:14px_14px]"
          aria-hidden
        />
      </div>
      <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
        <div className="group relative -mt-10">
          <UserAvatar
            name={name}
            src={draft.avatarDataUrl}
            size={88}
            className="ring-4 ring-card"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            aria-label="Change avatar"
          >
            <Camera className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void onFile(e)}
          />
        </div>

        <div className="min-w-0 flex-1 pt-3">
          <h3 className="truncate text-lg font-semibold tracking-tight">
            {name || <span className="text-muted-foreground">Add your name</span>}
          </h3>
          {draft.role.trim() && <p className="truncate text-sm text-muted-foreground">{draft.role.trim()}</p>}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Camera />
            {draft.avatarDataUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {draft.avatarDataUrl && (
            <Button variant="ghost" size="sm" onClick={() => onAvatar(null)} aria-label="Remove photo">
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {(draft.bio.trim() || meta.length > 0) && (
        <div className="space-y-3 border-t border-border/60 px-5 py-4">
          {draft.bio.trim() && (
            <p className="whitespace-pre-line text-sm leading-relaxed">{draft.bio.trim()}</p>
          )}
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {meta.map(({ icon: Icon, text }) => (
              <li key={text} className="flex min-w-0 items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{text}</span>
              </li>
            ))}
            {website && (
              <li className="flex min-w-0 items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <button
                  type="button"
                  className="truncate text-primary hover:underline"
                  onClick={() => void window.electronAPI?.app?.openExternal(website)}
                >
                  {draft.website.trim().replace(/^https?:\/\//, '')}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

function ActivitySection({ days }: { days: Record<string, Partial<Record<ActivityKind, number>>> }) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const log = useMemo(() => ({ days }), [days])
  const calendar = useMemo(() => buildActivityCalendar(log, { filter }), [log, filter])
  const streaks = useMemo(() => computeStreaks(log, { filter }), [log, filter])
  const allTime = useMemo(() => buildActivityCalendar(log), [log])

  const unit =
    filter === 'all' ? { one: 'contribution', many: 'contributions' } : ACTIVITY_KIND_LABELS[filter]
  const busiest = calendar.busiest
    ? parseDateKey(calendar.busiest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—'
  const breakdownTotal = Math.max(1, ACTIVITY_KINDS.reduce((t, k) => t + allTime.byKind[k], 0))

  return (
    <SettingsGroup
      title={`${calendar.total.toLocaleString()} ${calendar.total === 1 ? unit.one : unit.many} in the last year`}
      description="Every request you send, test you run, AI call, and mock server you create."
      icon={Activity}
      actions={
        <SegmentedControl value={filter} options={FILTER_OPTIONS} onChange={setFilter} ariaLabel="Activity type" />
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile icon={Zap} label="Active days" value={calendar.activeDays.toLocaleString()} />
        <StatTile
          icon={Flame}
          label="Current streak"
          value={`${streaks.current} ${streaks.current === 1 ? 'day' : 'days'}`}
          highlight={streaks.current > 0}
        />
        <StatTile icon={Trophy} label="Longest streak" value={`${streaks.longest} ${streaks.longest === 1 ? 'day' : 'days'}`} />
        <StatTile
          icon={CalendarDays}
          label="Busiest day"
          value={busiest}
          sub={calendar.busiest ? `${calendar.busiest.count.toLocaleString()} ${calendar.busiest.count === 1 ? unit.one : unit.many}` : undefined}
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-background/50 p-4">
        <ActivityCalendar key={filter} data={calendar} unit={unit} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {calendar.total === 0
              ? 'Send a request to start filling in your calendar.'
              : 'Hover a square for the day’s details.'}
          </p>
          <CalendarLegend />
        </div>
      </div>

      {allTime.total > 0 && (
        <div className="space-y-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {ACTIVITY_KINDS.map((kind) =>
              allTime.byKind[kind] ? (
                <div
                  key={kind}
                  className={cn('h-full', KIND_BAR_CLASSES[kind])}
                  style={{ width: `${(allTime.byKind[kind] / breakdownTotal) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {ACTIVITY_KINDS.map((kind) => (
              <li key={kind} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', KIND_BAR_CLASSES[kind])} />
                {KIND_TITLES[kind]}
                <span className="font-medium tabular-nums text-foreground">
                  {allTime.byKind[kind].toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsGroup>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  highlight
}: {
  icon: typeof Zap
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/50 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', highlight && 'text-orange-500')} />
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Privacy                                                             */
/* ------------------------------------------------------------------ */

function PrivacyGroup() {
  const clearActivity = useProfileStore((s) => s.clearActivity)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <SettingsGroup
        title="Your data"
        description="Profile and activity are stored in the app’s data folder on this device. Nothing is uploaded."
        icon={HardDrive}
        actions={
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 />
            Clear activity
          </Button>
        }
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Clear activity history?"
        description="This resets your activity calendar and streaks. Your requests, collections, and AI usage records are not affected."
        confirmLabel="Clear activity"
        variant="destructive"
        onConfirm={async () => {
          if (await clearActivity()) toast.success('Activity cleared')
          else toast.error('Couldn’t clear activity')
        }}
      />
    </>
  )
}
