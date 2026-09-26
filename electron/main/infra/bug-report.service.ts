import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { join } from 'path'
import type { BugReport, CreateBugReportInput, LogEntry } from '@shared/types'
import { redactText } from '@shared/lib/redact-secrets'
import { logger } from './logger.service'

const MAX_FIELD_LENGTH = 20_000

function clean(value = ''): string {
  return redactText(value).slice(0, MAX_FIELD_LENGTH)
}

function safeLog(entry: LogEntry): LogEntry {
  return { ...entry, message: clean(entry.message), context: clean(entry.context) || undefined }
}

class BugReportService {
  private reportPath(): string {
    const directory = join(app.getPath('userData'), 'reports')
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
    return join(directory, 'bug-reports.jsonl')
  }

  create(input: CreateBugReportInput): BugReport {
    const report: BugReport = {
      ...input,
      title: clean(input.title.trim()),
      description: clean(input.description.trim()),
      stepsToReproduce: clean(input.stepsToReproduce),
      expectedBehavior: clean(input.expectedBehavior),
      actualBehavior: clean(input.actualBehavior),
      route: clean(input.route),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: `${process.platform} ${process.arch}`,
      logs: input.includeDiagnostics ? logger.getRecent(50).map(safeLog) : []
    }
    appendFileSync(this.reportPath(), `${JSON.stringify(report)}\n`, 'utf8')
    logger.info(`Bug report created: ${report.id}`, 'BugReport')
    return report
  }

  list(): BugReport[] {
    const path = this.reportPath()
    if (!existsSync(path)) return []
    try {
      return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean)
        .map((line) => JSON.parse(line) as BugReport).reverse()
    } catch (error) {
      logger.error(`Could not read bug reports: ${String(error)}`, 'BugReport')
      return []
    }
  }
}

export const bugReportService = new BugReportService()
