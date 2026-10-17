// macOS signing for electron-builder, chosen from the environment so CI secrets alone
// switch a release from ad-hoc to Developer ID signing and notarization.
//
// - No certificate (today): ad-hoc sign (`identity: "-"`). Apple silicon refuses to run
//   unsigned code, which surfaces as "Shurikly is damaged"; an ad-hoc signature fixes that.
//   Gatekeeper still warns on first launch because the app isn't notarized.
// - CSC_LINK + CSC_KEY_PASSWORD (a Developer ID Application .p12) set: electron-builder picks
//   the identity from that certificate, with the hardened runtime that notarization requires.
//   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID also set: the app is notarized.
//
// See CONTRIBUTING.md → Releases.
const hasDeveloperId = Boolean(process.env.CSC_LINK || process.env.CSC_NAME)
const canNotarize = Boolean(
  hasDeveloperId &&
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
)

module.exports = {
  mac: hasDeveloperId
    ? {
        hardenedRuntime: true,
        entitlements: 'build/entitlements.mac.plist',
        entitlementsInherit: 'build/entitlements.mac.plist',
        // Left unset, electron-builder reads APPLE_ID etc. from the environment.
        ...(canNotarize ? {} : { notarize: false })
      }
    : {
        identity: '-',
        // Library validation would reject ad-hoc signed frameworks under the hardened runtime.
        hardenedRuntime: false,
        notarize: false
      }
}
