import type { AssistantTool } from './types'

export class ToolRegistry {
  private tools = new Map<string, AssistantTool>()

  register(tool: AssistantTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): AssistantTool | undefined {
    return this.tools.get(name)
  }

  list(): AssistantTool[] {
    return [...this.tools.values()]
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  descriptions(): Array<{ name: string; description: string; inputSchema: AssistantTool['inputSchema']; riskLevel: AssistantTool['riskLevel'] }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      riskLevel: tool.riskLevel
    }))
  }
}

export const toolRegistry = new ToolRegistry()
