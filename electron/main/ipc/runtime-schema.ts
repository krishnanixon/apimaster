import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import type { IpcResult } from '@shared/types'
import { logger } from '../infra/logger.service'

export interface RuntimeSchema<T> {
  parse(value: unknown, path?: string): T
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function fail(path: string, expected: string): never {
  throw new ValidationError(`${path} must be ${expected}`)
}

export const schema = {
  string(options: { min?: number; max?: number; pattern?: RegExp } = {}): RuntimeSchema<string> {
    return {
      parse(value, path = 'value') {
        if (typeof value !== 'string') fail(path, 'a string')
        if (options.min !== undefined && value.length < options.min) fail(path, `at least ${options.min} characters`)
        if (options.max !== undefined && value.length > options.max) fail(path, `at most ${options.max} characters`)
        if (options.pattern && !options.pattern.test(value)) fail(path, `a string matching ${options.pattern}`)
        return value
      }
    }
  },
  number(options: { min?: number; max?: number; integer?: boolean } = {}): RuntimeSchema<number> {
    return {
      parse(value, path = 'value') {
        if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'a finite number')
        if (options.integer && !Number.isInteger(value)) fail(path, 'an integer')
        if (options.min !== undefined && value < options.min) fail(path, `at least ${options.min}`)
        if (options.max !== undefined && value > options.max) fail(path, `at most ${options.max}`)
        return value
      }
    }
  },
  boolean(): RuntimeSchema<boolean> {
    return { parse: (value, path = 'value') => typeof value === 'boolean' ? value : fail(path, 'a boolean') }
  },
  literal<const T extends string | number | boolean>(...allowed: T[]): RuntimeSchema<T> {
    return {
      parse(value, path = 'value') {
        if (!allowed.includes(value as T)) fail(path, `one of ${allowed.join(', ')}`)
        return value as T
      }
    }
  },
  unknown<T = unknown>(): RuntimeSchema<T> {
    return { parse: (value) => value as T }
  },
  optional<T>(inner: RuntimeSchema<T>): RuntimeSchema<T | undefined> {
    return { parse: (value, path) => value === undefined ? undefined : inner.parse(value, path) }
  },
  nullable<T>(inner: RuntimeSchema<T>): RuntimeSchema<T | null> {
    return { parse: (value, path) => value === null ? null : inner.parse(value, path) }
  },
  array<T>(inner: RuntimeSchema<T>, options: { max?: number } = {}): RuntimeSchema<T[]> {
    return {
      parse(value, path = 'value') {
        if (!Array.isArray(value)) fail(path, 'an array')
        if (options.max !== undefined && value.length > options.max) fail(path, `an array with at most ${options.max} items`)
        return value.map((item, index) => inner.parse(item, `${path}[${index}]`))
      }
    }
  },
  record<T>(inner: RuntimeSchema<T>, options: { maxKeys?: number } = {}): RuntimeSchema<Record<string, T>> {
    return {
      parse(value, path = 'value') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'an object')
        const entries = Object.entries(value as Record<string, unknown>)
        if (options.maxKeys !== undefined && entries.length > options.maxKeys) fail(path, `an object with at most ${options.maxKeys} keys`)
        return Object.fromEntries(entries.map(([key, item]) => [key, inner.parse(item, `${path}.${key}`)]))
      }
    }
  },
  object<S extends Record<string, RuntimeSchema<unknown>>>(
    shape: S,
    options: { passthrough?: boolean } = {}
  ): RuntimeSchema<{ [K in keyof S]: ReturnType<S[K]['parse']> }> {
    return {
      parse(value, path = 'value') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'an object')
        const source = value as Record<string, unknown>
        const output: Record<string, unknown> = options.passthrough ? { ...source } : {}
        for (const [key, validator] of Object.entries(shape)) output[key] = validator.parse(source[key], `${path}.${key}`)
        return output as { [K in keyof S]: ReturnType<S[K]['parse']> }
      }
    }
  }
}

type SchemaTuple = readonly RuntimeSchema<unknown>[]
type ParsedArgs<S extends SchemaTuple> = { [K in keyof S]: S[K] extends RuntimeSchema<infer T> ? T : never }

export function validatedHandle<S extends SchemaTuple, T>(
  channel: string,
  schemas: S,
  handler: (event: IpcMainInvokeEvent, ...args: ParsedArgs<S>) => T | Promise<T>,
  logContext = 'IPC'
): void {
  ipcMain.handle(channel, async (event, ...rawArgs): Promise<T | IpcResult<never>> => {
    try {
      const args = schemas.map((validator, index) => validator.parse(rawArgs[index], `argument ${index + 1}`)) as ParsedArgs<S>
      return await handler(event, ...args)
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error
      logger.warn(`${channel}: ${error.message}`, logContext)
      return { success: false, error: `Invalid request: ${error.message}` }
    }
  })
}

export const ipcSchemas = {
  id: schema.string({ min: 1, max: 256 }),
  path: schema.string({ min: 1, max: 32_768 }),
  text: schema.string({ max: 10_000_000 }),
  shortText: schema.string({ max: 16_384 }),
  positiveInt: schema.number({ integer: true, min: 1, max: 1_000_000 })
}
