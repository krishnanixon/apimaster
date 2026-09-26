import { execSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronVersion = JSON.parse(
  readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')
).version

/** Detect the architecture of the installed Electron binary (may differ from Node under Rosetta). */
function getElectronArch() {
  if (process.platform === 'win32') {
    return process.arch
  }

  const candidates = [
    path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    path.join(root, 'node_modules/electron/dist/electron'),
    path.join(root, 'node_modules/electron/dist/electron.exe')
  ]
  const binary = candidates.find((p) => existsSync(p))
  if (binary) {
    try {
      const out = execSync(`file "${binary}"`, { encoding: 'utf8' })
      if (out.includes('arm64')) return 'arm64'
      if (out.includes('x86_64')) return 'x64'
    } catch {
      // fall through
    }
  }
  return process.arch
}

const electronArch = getElectronArch()
console.log(`Electron ${electronVersion} (${electronArch}) — rebuilding native modules...`)

const nativeModules = ['better-sqlite3', 'node-pty']

/** Fast path: download prebuilt binary when available. */
function tryPrebuild(moduleName) {
  const moduleDir = path.join(root, 'node_modules', moduleName)
  if (!existsSync(moduleDir)) return false
  try {
    console.log(`  → prebuild ${moduleName} (electron-${electronVersion}-${electronArch})`)
    execSync(
      `npx prebuild-install --runtime electron --target ${electronVersion} --arch ${electronArch}`,
      { cwd: moduleDir, stdio: 'inherit' }
    )
    return true
  } catch {
    console.log(`  → prebuild unavailable for ${moduleName}`)
    return false
  }
}

function isExecutable(filePath) {
  try {
    return (statSync(filePath).mode & 0o111) !== 0
  } catch {
    return false
  }
}

/** node-pty on macOS/Linux needs an executable spawn-helper alongside pty.node. */
function ensureNodePtySpawnHelper() {
  if (process.platform === 'win32') return

  const moduleDir = path.join(root, 'node_modules/node-pty')
  const helpers = [
    path.join(moduleDir, 'build', 'Release', 'spawn-helper'),
    path.join(moduleDir, 'build', 'Debug', 'spawn-helper'),
    path.join(moduleDir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
  ]

  for (const helper of helpers) {
    if (!existsSync(helper) || isExecutable(helper)) continue
    console.log(`  → chmod +x ${path.relative(root, helper)}`)
    chmodSync(helper, 0o755)
  }
}

function hasNativeBinary(moduleName) {
  const moduleDir = path.join(root, 'node_modules', moduleName)
  const archDir = `${process.platform}-${process.arch}`

  /** Native .node filenames differ by package (not always `${moduleName}.node`). */
  const nativeBinaryNames = {
    'better-sqlite3': ['better_sqlite3.node'],
    'node-pty': ['pty.node']
  }[moduleName] ?? [`${moduleName}.node`]

  const candidates = []
  for (const binaryName of nativeBinaryNames) {
    candidates.push(
      path.join(moduleDir, 'build', 'Release', binaryName),
      path.join(moduleDir, 'prebuilds', archDir, binaryName)
    )
  }
  return candidates.some((candidate) => existsSync(candidate))
}

function isNodePtyReady() {
  if (!hasNativeBinary('node-pty')) return false
  if (process.platform === 'win32') return true

  ensureNodePtySpawnHelper()

  const moduleDir = path.join(root, 'node_modules/node-pty')
  const archDir = `${process.platform}-${process.arch}`
  const helpers = [
    path.join(moduleDir, 'build', 'Release', 'spawn-helper'),
    path.join(moduleDir, 'build', 'Debug', 'spawn-helper'),
    path.join(moduleDir, 'prebuilds', archDir, 'spawn-helper')
  ]
  return helpers.some((helper) => existsSync(helper) && isExecutable(helper))
}

const needsRebuild = []
for (const mod of nativeModules) {
  if (!existsSync(path.join(root, 'node_modules', mod))) continue
  const prebuilt = tryPrebuild(mod)
  if (mod === 'node-pty') {
    if (!isNodePtyReady()) {
      needsRebuild.push(mod)
    } else if (!prebuilt) {
      // node-pty ships N-API prebuilds; Electron-specific prebuilds are optional.
      console.log('  → using N-API platform prebuilds for node-pty')
    }
    continue
  }
  if (!prebuilt && !hasNativeBinary(mod)) {
    needsRebuild.push(mod)
  }
}

ensureNodePtySpawnHelper()

if (needsRebuild.length > 0) {
  console.log(`  → electron-rebuild: ${needsRebuild.join(', ')}`)
  execSync(`npx electron-rebuild -f -w ${needsRebuild.join(',')}`, { cwd: root, stdio: 'inherit' })
} else {
  console.log('  → native modules ready, skipping electron-rebuild')
}

console.log('Generating Prisma client...')
execSync('npx prisma generate', { cwd: root, stdio: 'inherit' })
