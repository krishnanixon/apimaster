import type { AssistantTool } from '../types'

export const getCurrentTimeTool: AssistantTool = {
  name: 'get_current_time',
  description: 'Get the current local date and time.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute() {
    const now = new Date()
    return {
      ok: true,
      output: `${now.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
    }
  }
}
