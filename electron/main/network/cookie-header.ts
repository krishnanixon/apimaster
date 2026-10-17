/** Merges jar cookies into a user-written `Cookie` header; the user's values win on name clashes. */
export function mergeCookieHeader(userCookie: string | undefined, jarCookie: string): string {
  if (!userCookie?.trim()) return jarCookie
  if (!jarCookie) return userCookie
  const userNames = new Set(
    userCookie.split(';').map((part) => part.split('=')[0].trim()).filter(Boolean)
  )
  const extra = jarCookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !userNames.has(part.split('=')[0].trim()))
  return extra.length ? `${userCookie.trim().replace(/;\s*$/, '')}; ${extra.join('; ')}` : userCookie
}
