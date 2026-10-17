import type { UserProfile, UserProfilePatch } from '@shared/types'
import { applyProfilePatch, emptyProfile, normalizeProfile } from '@shared/lib/profile'
import { readJsonFile, writeJsonFile } from '../infra/json-store'

const STORE_FILE = 'profile.json'

export class ProfileRepository {
  get(): UserProfile {
    const raw = readJsonFile<unknown>(STORE_FILE, null)
    if (raw) return normalizeProfile(raw)
    // First read: pin "member since" to now so it doesn't drift on every launch
    const profile = emptyProfile()
    writeJsonFile(STORE_FILE, profile)
    return profile
  }

  update(patch: UserProfilePatch): UserProfile {
    const next = applyProfilePatch(this.get(), patch)
    writeJsonFile(STORE_FILE, next)
    return next
  }
}

export const profileRepository = new ProfileRepository()
