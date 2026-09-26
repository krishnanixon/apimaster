import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { AgentMemoryFact, AgentTaskRecord } from '@shared/types/agent'

interface MemoryFile {
  facts: AgentMemoryFact[]
  tasks: AgentTaskRecord[]
}

const EMPTY: MemoryFile = { facts: [], tasks: [] }

function filePath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'agent-memory.json')
}

function read(): MemoryFile {
  const path = filePath()
  if (!existsSync(path)) return { facts: [], tasks: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<MemoryFile>
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    }
  } catch {
    return { ...EMPTY }
  }
}

function write(data: MemoryFile): void {
  writeFileSync(filePath(), JSON.stringify(data, null, 2), 'utf-8')
}

class AgentMemoryService {
  private activeProjectId: string | null = null

  setActiveProjectId(projectId: string | null): void {
    this.activeProjectId = projectId
  }

  getActiveProjectId(): string | null {
    return this.activeProjectId
  }

  remember(input: { content: string; topic?: string; projectId?: string | null }): AgentMemoryFact {
    const data = read()
    const fact: AgentMemoryFact = {
      id: randomUUID(),
      projectId: input.projectId ?? null,
      content: input.content.trim(),
      topic: input.topic,
      createdAt: new Date().toISOString()
    }
    data.facts.unshift(fact)
    data.facts = data.facts.slice(0, 200)
    write(data)
    return fact
  }

  recall(query: string, projectId?: string | null): AgentMemoryFact[] {
    const needle = query.trim().toLowerCase()
    return read()
      .facts.filter((fact) => {
        if (projectId && fact.projectId && fact.projectId !== projectId) return false
        if (!needle) return true
        return `${fact.content} ${fact.topic ?? ''}`.toLowerCase().includes(needle)
      })
      .slice(0, 12)
  }

  saveTask(task: AgentTaskRecord): void {
    const data = read()
    const index = data.tasks.findIndex((item) => item.id === task.id)
    if (index >= 0) data.tasks[index] = task
    else data.tasks.unshift(task)
    data.tasks = data.tasks.slice(0, 50)
    write(data)
  }

  listTasks(): AgentTaskRecord[] {
    return read().tasks
  }
}

export const agentMemory = new AgentMemoryService()
