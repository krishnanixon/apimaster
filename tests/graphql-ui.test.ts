/** @vitest-environment happy-dom */
import { createElement, type ReactNode } from 'react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphQLQueryChrome } from '../src/modules/api-studio/components/request/GraphQLQueryChrome'
import { GraphQLVariableHints } from '../src/modules/api-studio/components/request/GraphQLVariableHints'
import { GraphQLErrorsView } from '../src/modules/api-studio/components/response/GraphQLErrorsView'
import { applyRequestType } from '../src/modules/api-studio/services/graphql/model'
import { createEmptyRequest } from '../src/modules/api-studio/services/requestBuilder'

let root: Root | null = null

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(node)
  })
  return container
}

describe('GraphQL editor UI', () => {
  it('switches a request into the GraphQL editor model', () => {
    const rest = createEmptyRequest('Users')
    rest.url = 'https://api.example.com/users'
    const graphql = { ...rest, ...applyRequestType(rest, 'graphql') }
    expect(graphql.requestType).toBe('graphql')
    expect(graphql.url).toBe('https://api.example.com/users')
    expect(rest.requestType).toBe('http')
  })

  it('renders the operation selector, schema state, and actions', () => {
    const onOperationName = vi.fn()
    const onFormat = vi.fn()
    const onFetchSchema = vi.fn()
    render(
      createElement(GraphQLQueryChrome, {
        operations: [
          { name: 'GetUsers', operation: 'query' },
          { name: 'GetPosts', operation: 'query' }
        ],
        operationName: 'GetUsers',
        onOperationName,
        schemaStatus: 'available',
        loading: false,
        onFormat,
        onFetchSchema,
        issues: ['Cannot query field "usr" on type "Query".']
      })
    )

    expect(document.querySelector('[data-testid="graphql-schema-status"]')?.textContent).toBe('Schema available')
    const select = document.querySelector('select[aria-label="GraphQL operation"]') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(
      expect.arrayContaining(['query GetUsers', 'query GetPosts'])
    )
    select.value = 'GetPosts'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onOperationName).toHaveBeenCalledWith('GetPosts')

    const buttons = Array.from(document.querySelectorAll('button')).map((button) => button.textContent)
    expect(buttons.some((label) => label?.includes('Format query'))).toBe(true)
    expect(buttons.some((label) => label?.includes('Refresh schema'))).toBe(true)
    expect(document.body.textContent).toContain('Cannot query field "usr"')

    document.querySelectorAll('button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onFetchSchema).toHaveBeenCalled()
  })

  it('shows schema loading and unavailable states', () => {
    render(
      createElement(GraphQLQueryChrome, {
        operations: [],
        onOperationName: () => undefined,
        schemaStatus: 'loading',
        loading: true,
        onFormat: () => undefined,
        onFetchSchema: () => undefined,
        issues: []
      })
    )
    expect(document.body.textContent).toContain('Schema loading')

    act(() => root?.unmount())
    render(
      createElement(GraphQLQueryChrome, {
        operations: [],
        onOperationName: () => undefined,
        schemaStatus: 'unavailable',
        schemaDetail: 'The server did not return a GraphQL schema.',
        loading: false,
        onFormat: () => undefined,
        onFetchSchema: () => undefined,
        issues: []
      })
    )
    expect(document.body.textContent).toContain('Schema unavailable')
    expect(document.body.textContent).toContain('Fetch schema')
  })

  it('renders variable hints and GraphQL errors apart from HTTP status', () => {
    render(
      createElement(
        'div',
        null,
        createElement(GraphQLVariableHints, {
          variables: [
            { name: 'id', type: 'ID!', required: true, hasDefault: false },
            { name: 'includeEmail', type: 'Boolean', required: false, hasDefault: true }
          ],
          errors: ['Missing required variable "$id" (ID!).']
        }),
        createElement(GraphQLErrorsView, {
          info: {
            data: null,
            hasErrors: true,
            errors: [{ message: 'Unauthorized', path: ['user'] }]
          }
        })
      )
    )
    expect(document.body.textContent).toContain('$id: ID! required')
    expect(document.body.textContent).toContain('Missing required variable')
    expect(document.body.textContent).toContain('Unauthorized')
  })
})
