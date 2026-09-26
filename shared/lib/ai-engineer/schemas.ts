import { z } from 'zod'

const assertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), values: z.array(z.number().int()) }),
  z.object({
    type: z.literal('jsonPath'),
    path: z.string(),
    operator: z.enum(['exists', 'equals', 'type']),
    value: z.unknown().optional()
  }),
  z.object({
    type: z.literal('header'),
    name: z.string(),
    operator: z.enum(['exists', 'equals']),
    value: z.string().optional()
  }),
  z.object({ type: z.literal('bodyContains'), value: z.string() })
])

export const aiGeneratedTestSchema = z.object({
  name: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
  query: z.record(z.string(), z.string()).default({}),
  body: z.string().optional(),
  bodyType: z.enum(['none', 'json', 'text']).default('none'),
  expectedStatus: z.array(z.number().int()).min(1),
  assertions: z.array(assertionSchema).default([]),
  reason: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  category: z.enum(['functional', 'edge', 'auth', 'regression']),
  endpointId: z.string().optional()
})

export const aiTestGenerationResponseSchema = z.object({
  tests: z.array(aiGeneratedTestSchema)
})

export const aiFailureAnalysisResponseSchema = z.object({
  title: z.string(),
  observedBehavior: z.string(),
  expectedBehavior: z.string(),
  likelyExplanation: z.string(),
  category: z.string(),
  suggestedNextStep: z.string()
})

export type ParsedAiGeneratedTest = z.infer<typeof aiGeneratedTestSchema>
