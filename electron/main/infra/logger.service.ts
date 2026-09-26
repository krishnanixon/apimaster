import type { LogEntry } from '@shared/types'
import { redactText } from '@shared/lib/redact-secrets'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

class LoggerService {
  private logPath: string | null = null

  private ensureLogPath(): string {
    if (this.logPath) return this.logPath

    const logDir = join(app.getPath('userData'), 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    this.logPath = join(logDir, 'app.log')
    return this.logPath
  }

  write(entry: Omit<LogEntry, 'timestamp'>): void {
    const logEntry: LogEntry = {
      ...entry,
      message: redactText(entry.message),
      context: entry.context ? redactText(entry.context) : undefined,
      timestamp: new Date().toISOString()
    }
    const line = JSON.stringify(logEntry) + '\n'
    appendFileSync(this.ensureLogPath(), line, 'utf-8')
  }

  info(message: string, context?: string): void {
    this.write({ level: 'info', message, context })
  }

  warn(message: string, context?: string): void {
    this.write({ level: 'warn', message, context })
  }

  error(message: string, context?: string): void {
    this.write({ level: 'error', message, context })
  }

  debug(message: string, context?: string): void {
    this.write({ level: 'debug', message, context })
  }

  getRecent(limit = 100): LogEntry[] {
    const logPath = this.logPath
    if (!logPath || !existsSync(logPath)) return []

    try {
      const content = readFileSync(logPath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      return lines
        .slice(-limit)
        .map((line) => JSON.parse(line) as LogEntry)
        .reverse()
    } catch {
      return []
    }
  }
}

export const logger = new LoggerService()
