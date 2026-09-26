import { createContext, useContext } from 'react'

export const FlowValidationContext = createContext<Map<string, string>>(new Map())

export function useNodeValidationSeverity(nodeId: string): string | undefined {
  const map = useContext(FlowValidationContext)
  return map.get(nodeId)
}
