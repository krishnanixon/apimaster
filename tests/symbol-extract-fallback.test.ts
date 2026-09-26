import { describe, expect, it } from 'vitest'
import { extractWithFallback } from '../shared/lib/symbol-extract-fallback'

describe('symbol-extract-fallback', () => {
  it('extracts JS functions, classes, types, and imports', () => {
    const source = `
import { readFile } from 'fs'
import helper from './helper'

export function loadConfig() {}
export class Workspace {}
export interface Indexer {}
export type Hit = { path: string }
export enum Kind { File }

export const run = () => {}
    `
    const result = extractWithFallback(source, 'typescript')
    expect(result.parser).toBe('fallback')
    expect(result.imports.map((item) => item.specifier)).toEqual(expect.arrayContaining(['fs', './helper']))
    expect(result.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        'function:loadConfig',
        'class:Workspace',
        'interface:Indexer',
        'type:Hit',
        'enum:Kind',
        'function:run'
      ])
    )
  })

  it('marks React components, hooks, and routes', () => {
    const source = `
import { useState } from 'react'
export function SearchPanel() {
  useState(false)
  return <Route path="/search" />
}
app.get('/api/status', handler)
    `
    const result = extractWithFallback(source, 'tsx')
    expect(result.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        'component:SearchPanel',
        'hook:useState',
        'route:/search',
        'endpoint:GET /api/status',
        'route:/api/status'
      ])
    )
  })

  it('extracts python classes and functions', () => {
    const source = `
from os import path
class Scanner:
    pass
def walk(root):
    return root
    `
    const result = extractWithFallback(source, 'python')
    expect(result.symbols.map((symbol) => symbol.name)).toEqual(expect.arrayContaining(['Scanner', 'walk']))
    expect(result.imports.some((item) => item.specifier.includes('os'))).toBe(true)
  })
})
