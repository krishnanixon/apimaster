import type { AgentToolRisk } from '@shared/types/agent'
import type { JsonSchema } from '../voice-assistant/tools/types'
import { validateToolInput } from '../voice-assistant/tools/types'

export interface AgentTool {
  name: string
  description: string
  riskLevel: AgentToolRisk
  inputSchema: JsonSchema
  execute(input: Record<string, unknown>): Promise<{ ok: boolean; output: string }>
}

class AgentToolRegistry {
  private tools = new Map<string, AgentTool>()

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name)
  }

  list(): AgentTool[] {
    return [...this.tools.values()]
  }

  descriptions(allowed?: readonly string[]): string {
    const tools = allowed ? this.list().filter((tool) => allowed.includes(tool.name)) : this.list()
    return tools
      .map((tool) => {
        const required = tool.inputSchema.required?.join(', ') || 'none'
        return `- ${tool.name} (${tool.riskLevel}): ${tool.description} Required: ${required}`
      })
      .join('\n')
  }
}

export const agentToolRegistry = new AgentToolRegistry()
export { validateToolInput }
