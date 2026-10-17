import type { PythonModelIndex } from './models'
import { parseCall, type PyBinding, type PyModule, type PythonModuleIndex } from './source'

/** Everything the Python linkers need to follow names across the project. */
export interface PythonContext {
  index: PythonModuleIndex
  models: PythonModelIndex
  modules: Map<string, PyModule>
  bindingsOf: (file: string) => Map<string, PyBinding>
  constsOf: (file: string) => Map<string, string>
}

/**
 * Module file a dotted expression's prefix names: for `user.views.blueprint` from `app.py`,
 * `user` → `conduit/user/__init__.py`, then `views` → `conduit/user/views.py`.
 * Returns the module file and the final attribute name.
 */
export function resolveDotted(ctx: PythonContext, file: string, expr: string): { file: string; name: string } | null {
  const parts = expr.trim().split('.')
  if (parts.length === 1) return { file, name: parts[0] }
  const first = ctx.bindingsOf(file).get(parts[0])
  let current: string | null =
    first?.kind === 'module'
      ? first.file
      : first?.kind === 'symbol'
        ? ctx.index.childModule(first.file, first.name) ??
          (() => {
            const inner = ctx.bindingsOf(first.file).get(first.name)
            return inner?.kind === 'module' ? inner.file : null
          })()
        : null
  for (const part of parts.slice(1, -1)) {
    if (!current) return null
    const bound = ctx.bindingsOf(current).get(part)
    current = bound?.kind === 'module' ? bound.file : ctx.index.childModule(current, part)
  }
  return current ? { file: current, name: parts[parts.length - 1] } : null
}

/**
 * Class behind a schema/serializer expression: `ArticleSchema`, `ArticleSchema()`, or an instance
 * variable such as `article_schema = ArticleSchema()` (possibly imported from another module).
 */
export function resolveInstanceClass(ctx: PythonContext, file: string, expr: string, depth = 0): string | null {
  const text = expr.trim()
  const call = parseCall(text)
  if (call) return call.callee.split('.').pop() ?? null
  if (depth > 4 || !/^[\w.]+$/.test(text)) return null
  const target = resolveDotted(ctx, file, text)
  if (!target) return null
  const assignment = ctx.modules.get(target.file)?.assignments.find((a) => a.name === target.name && a.indent === 0)
  if (assignment) return resolveInstanceClass(ctx, target.file, assignment.value, depth + 1)
  const binding = ctx.bindingsOf(target.file).get(target.name)
  if (binding?.kind === 'symbol') return resolveInstanceClass(ctx, binding.file, binding.name, depth + 1)
  return ctx.models.get(target.name) ? target.name : null
}
