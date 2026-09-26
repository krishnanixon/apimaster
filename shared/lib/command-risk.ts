export type CommandRiskLevel = 'SAFE' | 'WARNING' | 'DANGEROUS' | 'BLOCKED'

export interface CommandRiskResult {
  level: CommandRiskLevel
  reason: string
  command: string
}

const KNOWN_CLEAN_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'tmp',
  '.cache',
  'out',
  'release'
])

function normalize(command: string): string {
  return command.replace(/\s+/g, ' ').trim()
}

function lower(command: string): string {
  return normalize(command).toLowerCase()
}

function isRootWipeTarget(target: string): boolean {
  const t = target.trim().replace(/^["']|["']$/g, '')
  if (!t) return true
  if (t === '/' || t === '/*' || t === '/**') return true
  if (t === '~' || t === '~/' || t === '~/*' || t === '$home' || t === '$home/' || t === '${home}') {
    return true
  }
  if (/^[a-z]:\\?$/i.test(t) || /^[a-z]:\\?\*$/i.test(t)) return true
  if (t === '\\' || t === '/*.*') return true
  return false
}

function rmRfTarget(command: string): string | null {
  const match = lower(command).match(
    /\brm\s+(?:-[a-z]*f[a-z]*r[a-z]*|-[a-z]*r[a-z]*f[a-z]*)\s+(?:--\s+)?(.+)$/i
  )
  if (!match) return null
  return match[1].split(/\s+/)[0] ?? null
}

function isPipeToShell(command: string): boolean {
  const c = lower(command)
  return (
    /\b(curl|wget|iwr|invoke-webrequest)\b/.test(c) &&
    /\|\s*(sh|bash|zsh|fish|pwsh|powershell|cmd)\b/.test(c)
  )
}

function firstToken(command: string): string {
  const trimmed = normalize(command)
  if (!trimmed) return ''
  const token = trimmed.split(' ')[0] ?? ''
  return token.replace(/^.*[/\\]/, '').replace(/\.exe$/i, '').toLowerCase()
}

/**
 * Classify a shell command before execution. Unknown commands are WARNING,
 * never SAFE — the agent must not get unrestricted shell by default.
 */
export function classifyCommandRisk(command: string): CommandRiskResult {
  const original = normalize(command)
  if (!original) {
    return { level: 'BLOCKED', reason: 'Empty command', command: original }
  }

  const c = lower(original)

  if (c.length > 8192) {
    return { level: 'BLOCKED', reason: 'Command exceeds length limit', command: original }
  }

  if (/\x00/.test(original)) {
    return { level: 'BLOCKED', reason: 'Command contains a NUL byte', command: original }
  }

  if (/\bmkfs(\.\w+)?\b/.test(c) || /\bformat\s+[a-z]:/.test(c) || /\bdiskpart\b/.test(c)) {
    return { level: 'BLOCKED', reason: 'Disk format / partition commands are blocked', command: original }
  }

  if (/\bdd\b/.test(c) && /\bof\s*=\s*\/dev\//.test(c)) {
    return { level: 'BLOCKED', reason: 'Writing raw disks is blocked', command: original }
  }

  if (c.includes(':(){ :|:& };:') || c.includes(':(){:|:&};:')) {
    return { level: 'BLOCKED', reason: 'Fork bomb is blocked', command: original }
  }

  if (/\b(shutdown|reboot|halt|poweroff)\b/.test(c) || /\binit\s+[06]\b/.test(c)) {
    return { level: 'BLOCKED', reason: 'System power commands are blocked', command: original }
  }

  if (isPipeToShell(c)) {
    return { level: 'BLOCKED', reason: 'Piping remote scripts into a shell is blocked', command: original }
  }

  if (/\bchmod\s+-r\s+777\s+\//.test(c) || /\bchown\s+-r\s+\S+\s+\//.test(c)) {
    return { level: 'BLOCKED', reason: 'Recursive ownership changes on / are blocked', command: original }
  }

  const rmTarget = rmRfTarget(original)
  if (rmTarget && isRootWipeTarget(rmTarget)) {
    return { level: 'BLOCKED', reason: 'Recursive delete of a filesystem root is blocked', command: original }
  }

  if (/\bremove-item\b/.test(c) && /\b-recurse\b/.test(c) && /\b-force\b/.test(c)) {
    const target = original.split(/\s+/).find((part) => /^[a-z]:\\?$/i.test(part) || part === '/' || part === 'C:\\')
    if (target && isRootWipeTarget(target)) {
      return { level: 'BLOCKED', reason: 'Recursive delete of a filesystem root is blocked', command: original }
    }
  }

  if (rmTarget) {
    const base = rmTarget.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? rmTarget
    if (KNOWN_CLEAN_DIRS.has(base)) {
      return {
        level: 'WARNING',
        reason: `Recursive delete of ${base} can be recovered by reinstalling dependencies`,
        command: original
      }
    }
    return { level: 'DANGEROUS', reason: 'Recursive delete can destroy source files', command: original }
  }

  if (/\bgit\s+push\b/.test(c) && /(^|\s)(--force|-f)(\s|$)/.test(c)) {
    return { level: 'DANGEROUS', reason: 'Force-push rewrites remote history', command: original }
  }

  if (/\bgit\s+reset\s+--hard\b/.test(c) || /\bgit\s+clean\s+-[a-z]*f/.test(c)) {
    return { level: 'DANGEROUS', reason: 'Hard reset / clean discards local work', command: original }
  }

  if (/\bnpm\s+publish\b/.test(c) || /\byarn\s+publish\b/.test(c) || /\bpnpm\s+publish\b/.test(c)) {
    return { level: 'DANGEROUS', reason: 'Publishing a package is irreversible', command: original }
  }

  if (/\bdrop\s+(table|database|schema)\b/.test(c) || /\bdocker\s+system\s+prune\b/.test(c)) {
    return { level: 'DANGEROUS', reason: 'Destructive data / docker prune command', command: original }
  }

  if (/\beval\b/.test(c) || /\binvoke-expression\b/.test(c) || /\biex\b/.test(c)) {
    return { level: 'DANGEROUS', reason: 'Dynamic code evaluation', command: original }
  }

  if (
    /\bgit\s+(commit|push|merge|rebase|reset|revert|tag|stash\s+drop)\b/.test(c) ||
    /\bsudo\b/.test(c) ||
    /\b(chmod|chown|kill|taskkill)\b/.test(c) ||
    /\bnpm\s+install\s+-g\b/.test(c) ||
    /\brm\b/.test(c) ||
    /\bdel\b/.test(c) ||
    /\bremove-item\b/.test(c)
  ) {
    if (/\bgit\s+commit\b/.test(c)) {
      return { level: 'WARNING', reason: 'Git commit writes to the repository', command: original }
    }
    return { level: 'WARNING', reason: 'Command can change files, processes, or git state', command: original }
  }

  const token = firstToken(original)
  const safeTokens = new Set([
    'git',
    'npm',
    'npx',
    'pnpm',
    'yarn',
    'node',
    'tsc',
    'eslint',
    'prettier',
    'vitest',
    'jest',
    'pytest',
    'python',
    'python3',
    'go',
    'cargo',
    'ls',
    'dir',
    'cat',
    'type',
    'echo',
    'pwd',
    'cd',
    'whoami',
    'where',
    'which',
    'head',
    'tail',
    'find',
    'rg',
    'grep',
    'wc',
    'mkdir',
    'touch',
    'code'
  ])

  if (token === 'git') {
    if (/\bgit\s+(status|diff|log|show|branch|rev-parse|describe|blame|ls-files|remote)\b/.test(c)) {
      return { level: 'SAFE', reason: 'Read-only git command', command: original }
    }
  }

  if (token === 'npm' || token === 'npx' || token === 'pnpm' || token === 'yarn') {
    if (/\b(npm|pnpm|yarn)\s+(install|ci|run|test|lint|build|exec)\b/.test(c) || token === 'npx') {
      return { level: 'SAFE', reason: 'Local package-manager / script command', command: original }
    }
  }

  if (safeTokens.has(token) && !/\brm\b/.test(c)) {
    return { level: 'SAFE', reason: 'Common development command', command: original }
  }

  return { level: 'WARNING', reason: 'Unknown command — requires review before agent execution', command: original }
}

export function isCommandBlocked(command: string): boolean {
  return classifyCommandRisk(command).level === 'BLOCKED'
}

/** DANGEROUS commands need an explicit acceptRisk flag. BLOCKED never runs. */
export function canAutoExecute(level: CommandRiskLevel, acceptRisk = false): boolean {
  if (level === 'BLOCKED') return false
  if (level === 'DANGEROUS') return acceptRisk
  return true
}
