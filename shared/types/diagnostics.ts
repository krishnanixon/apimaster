import type { LogEntry } from './index'

export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical'
export type BugReportCategory = 'bug' | 'crash' | 'performance' | 'data' | 'other'

export interface CreateBugReportInput {
  title: string
  description: string
  stepsToReproduce?: string
  expectedBehavior?: string
  actualBehavior?: string
  severity: BugReportSeverity
  category: BugReportCategory
  route?: string
  includeDiagnostics: boolean
  renderer?: {
    userAgent: string
    language: string
    platform: string
  }
}

export interface BugReport extends CreateBugReportInput {
  id: string
  createdAt: string
  appVersion: string
  platform: string
  logs: LogEntry[]
}

