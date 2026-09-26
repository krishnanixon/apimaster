import {
  Kind,
  parse,
  print,
  validate,
  type DocumentNode,
  type GraphQLSchema,
  type OperationDefinitionNode,
  type TypeNode
} from 'graphql'
import type { GraphQLSchemaMetadata } from '../../types/api.types'
import { schemaFromIntrospection } from './schema'

export class GraphQLClientError extends Error {
  readonly details: string[]

  constructor(message: string, details: string[] = [message]) {
    super(message)
    this.name = 'GraphQLClientError'
    this.details = details
  }
}

export interface GraphQLOperationInfo {
  name: string | null
  operation: 'query' | 'mutation' | 'subscription'
}

export interface GraphQLVariableInfo {
  name: string
  type: string
  required: boolean
  hasDefault: boolean
}

export interface GraphQLInspection {
  operations: GraphQLOperationInfo[]
  syntaxError?: string
  documentError?: string
  validationErrors: string[]
  variableErrors: string[]
  variables: GraphQLVariableInfo[]
  /** Set when a named operation should be sent. Omitted for a single anonymous operation. */
  operationName?: string
  parsedVariables: Record<string, unknown>
  variablesError?: string
}

export function formatGraphQL(source: string): string {
  const trimmed = source.trim()
  if (!trimmed) return source
  let printed: string
  try {
    printed = print(parse(source))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid GraphQL'
    throw new GraphQLClientError(message.replace(/^Syntax Error: /, 'Invalid GraphQL: '))
  }
  if (hasComment(source) && !hasComment(printed)) {
    throw new GraphQLClientError('Formatting would remove comments, so the query was left unchanged.')
  }
  return printed.endsWith('\n') ? printed : `${printed}\n`
}

function hasComment(source: string): boolean {
  return /(^|\n)\s*#/.test(source)
}

export function parseVariablesJson(text: string): { value: Record<string, unknown>; error?: string } {
  const trimmed = text.trim()
  if (!trimmed) return { value: {} }
  try {
    const value = JSON.parse(trimmed) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { value: {}, error: 'Variables must be a JSON object.' }
    }
    return { value: value as Record<string, unknown> }
  } catch {
    return { value: {}, error: 'Variables are not valid JSON.' }
  }
}

export function inspectGraphQL(input: {
  query: string
  variablesText: string
  operationName?: string
  schema?: GraphQLSchema | null
}): GraphQLInspection {
  const variablesParsed = parseVariablesJson(input.variablesText)
  const empty: GraphQLInspection = {
    operations: [],
    validationErrors: [],
    variableErrors: [],
    variables: [],
    parsedVariables: variablesParsed.value,
    variablesError: variablesParsed.error
  }

  if (!input.query.trim()) {
    return { ...empty, syntaxError: 'Write a GraphQL query before sending.' }
  }

  let document: DocumentNode
  try {
    document = parse(input.query)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid GraphQL'
    return { ...empty, syntaxError: message.replace(/^Syntax Error: /, 'Invalid GraphQL: ') }
  }

  const operations = document.definitions
    .filter((node): node is OperationDefinitionNode => node.kind === Kind.OPERATION_DEFINITION)
    .map((node) => ({
      name: node.name?.value ?? null,
      operation: node.operation
    }))

  if (operations.length === 0) {
    return { ...empty, operations, documentError: 'Add a query, mutation, or subscription.' }
  }

  const unnamed = operations.filter((op) => !op.name).length
  if (operations.length > 1 && unnamed > 0) {
    return {
      ...empty,
      operations,
      documentError: 'Name every operation when a document contains more than one.'
    }
  }

  let operationName: string | undefined
  let documentError: string | undefined
  if (operations.length === 1) {
    operationName = operations[0].name ?? undefined
  } else {
    const names = operations.map((op) => op.name).filter((name): name is string => Boolean(name))
    if (!input.operationName || !names.includes(input.operationName)) {
      documentError = `Select an operation before sending. Available: ${names.join(', ')}.`
    } else {
      operationName = input.operationName
    }
  }

  const selected = document.definitions.find(
    (node): node is OperationDefinitionNode =>
      node.kind === Kind.OPERATION_DEFINITION && (node.name?.value ?? undefined) === operationName
  )

  const variables = selected ? variableInfos(selected) : []
  const variableErrors = variablesParsed.error
    ? [variablesParsed.error]
    : selected
      ? missingVariableErrors(variables, variablesParsed.value)
      : []

  const validationErrors =
    input.schema && !documentError
      ? validate(input.schema, document).map((error) => error.message)
      : []

  return {
    operations,
    documentError,
    validationErrors,
    variableErrors,
    variables,
    operationName,
    parsedVariables: variablesParsed.value,
    variablesError: variablesParsed.error
  }
}

export function blockingGraphQLIssues(inspection: GraphQLInspection): string[] {
  return [
    ...(inspection.syntaxError ? [inspection.syntaxError] : []),
    ...(inspection.documentError ? [inspection.documentError] : []),
    ...inspection.variableErrors,
    ...inspection.validationErrors
  ]
}

export function schemaForRequest(metadata?: GraphQLSchemaMetadata): GraphQLSchema | null {
  return schemaFromIntrospection(metadata?.introspection)
}

function variableInfos(operation: OperationDefinitionNode): GraphQLVariableInfo[] {
  return (operation.variableDefinitions ?? []).map((definition) => ({
    name: definition.variable.name.value,
    type: typeToString(definition.type),
    required: definition.type.kind === Kind.NON_NULL_TYPE && !definition.defaultValue,
    hasDefault: Boolean(definition.defaultValue)
  }))
}

function missingVariableErrors(variables: GraphQLVariableInfo[], values: Record<string, unknown>): string[] {
  const errors: string[] = []
  for (const variable of variables) {
    if (!variable.required) continue
    if (!(variable.name in values) || values[variable.name] === null) {
      errors.push(`Missing required variable "$${variable.name}" (${variable.type}).`)
    }
  }
  return errors
}

function typeToString(type: TypeNode): string {
  if (type.kind === Kind.NON_NULL_TYPE) return `${typeToString(type.type)}!`
  if (type.kind === Kind.LIST_TYPE) return `[${typeToString(type.type)}]`
  return type.name.value
}
