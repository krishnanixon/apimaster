import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import type { DbExplorerNode } from '@shared/types/database-workspace'

const COLLECTION_METHODS: Array<[string, string]> = [
  ['find', 'find({ })'],
  ['findOne', 'findOne({ })'],
  ['aggregate', 'aggregate([{ $match: { } }])'],
  ['countDocuments', 'countDocuments({ })'],
  ['distinct', 'distinct("field", { })'],
  ['insertOne', 'insertOne({ })'],
  ['insertMany', 'insertMany([{ }])'],
  ['updateOne', 'updateOne({ }, { $set: { } })'],
  ['updateMany', 'updateMany({ }, { $set: { } })'],
  ['replaceOne', 'replaceOne({ }, { })'],
  ['deleteOne', 'deleteOne({ })'],
  ['deleteMany', 'deleteMany({ })'],
  ['createIndex', 'createIndex({ field: 1 })'],
  ['getIndexes', 'getIndexes()'],
  ['stats', 'stats()']
]

const CURSOR_METHODS = ['sort({ _id: -1 })', 'limit(50)', 'skip(0)', 'project({ })', 'count()', 'explain()']

const OPERATORS = [
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$and', '$or', '$not', '$nor', '$exists', '$type',
  '$regex', '$elemMatch', '$size', '$all', '$set', '$unset', '$inc', '$push', '$pull', '$addToSet',
  '$match', '$group', '$project', '$sort', '$limit', '$skip', '$lookup', '$unwind', '$count', '$facet',
  '$addFields', '$sum', '$avg', '$min', '$max', '$first', '$last'
]

function collectCollections(tree: DbExplorerNode[]): string[] {
  const out: string[] = []
  const walk = (nodes: DbExplorerNode[]) => {
    for (const node of nodes) {
      if ((node.type === 'collection' || node.type === 'view') && node.table) out.push(node.table)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(tree)
  return [...new Set(out)]
}

export function buildMongoCompletionExtension(tree: DbExplorerNode[]) {
  const collections = collectCollections(tree)

  const source = (context: CompletionContext) => {
    // db.<collection>
    const dbDot = context.matchBefore(/\bdb\.[\w$]*$/)
    if (dbDot) {
      const options: Completion[] = [
        ...collections.map((c) => ({ label: c, type: 'class', detail: 'collection' })),
        { label: 'getCollection', apply: 'getCollection("")', type: 'method' },
        { label: 'runCommand', apply: 'runCommand({ ping: 1 })', type: 'method' },
        { label: 'getCollectionNames', apply: 'getCollectionNames()', type: 'method' },
        { label: 'stats', apply: 'stats()', type: 'method' }
      ]
      return { from: dbDot.from + 3, options, validFor: /^[\w$]*$/ }
    }
    // db.<collection>.<method> or cursor chain
    const methodDot = context.matchBefore(/\)?\.[\w$]*$/)
    if (methodDot) {
      const before = context.state.sliceDoc(Math.max(0, methodDot.from - 200), methodDot.from)
      const isCursor = methodDot.text.startsWith(')')
      const offset = isCursor ? 2 : 1
      if (isCursor) {
        return {
          from: methodDot.from + offset,
          options: CURSOR_METHODS.map((m) => ({ label: m.split('(')[0], apply: m, type: 'method' })),
          validFor: /^[\w$]*$/
        }
      }
      if (/\bdb\.[\w$]+$|getCollection\([^)]*\)$/.test(before)) {
        return {
          from: methodDot.from + offset,
          options: COLLECTION_METHODS.map(([label, apply]) => ({ label, apply, type: 'method' })),
          validFor: /^[\w$]*$/
        }
      }
    }
    // $operators
    const op = context.matchBefore(/\$[\w]*$/)
    if (op) {
      return { from: op.from, options: OPERATORS.map((o) => ({ label: o, type: 'keyword' })), validFor: /^\$?\w*$/ }
    }
    const word = context.matchBefore(/\w+$/)
    if (!word && !context.explicit) return null
    return {
      from: word?.from ?? context.pos,
      options: [
        { label: 'db', type: 'variable' },
        { label: 'ObjectId', apply: 'ObjectId("")', type: 'function' },
        { label: 'ISODate', apply: 'ISODate("")', type: 'function' },
        { label: 'NumberLong', apply: 'NumberLong("")', type: 'function' },
        { label: 'NumberDecimal', apply: 'NumberDecimal("")', type: 'function' }
      ]
    }
  }

  return autocompletion({ override: [source], activateOnTyping: true })
}

/** Query templates offered in the MongoDB shell toolbar. */
export function mongoTemplates(collection: string): Array<{ label: string; query: string }> {
  const ref = /^[A-Za-z_$][\w$]*$/.test(collection) ? `db.${collection}` : `db.getCollection(${JSON.stringify(collection)})`
  return [
    { label: 'Find', query: `${ref}.find({}).sort({ _id: -1 }).limit(50)` },
    { label: 'Find by id', query: `${ref}.findOne({ _id: ObjectId("") })` },
    { label: 'Count', query: `${ref}.countDocuments({})` },
    { label: 'Distinct values', query: `${ref}.distinct("field")` },
    {
      label: 'Group & count',
      query: `${ref}.aggregate([\n  { $group: { _id: "$field", count: { $sum: 1 } } },\n  { $sort: { count: -1 } },\n  { $limit: 20 }\n])`
    },
    {
      label: 'Lookup (join)',
      query: `${ref}.aggregate([\n  { $lookup: { from: "other", localField: "otherId", foreignField: "_id", as: "other" } },\n  { $limit: 20 }\n])`
    },
    { label: 'Insert one', query: `${ref}.insertOne({ })` },
    { label: 'Update many', query: `${ref}.updateMany({ }, { $set: { } })` },
    { label: 'Indexes', query: `${ref}.getIndexes()` },
    { label: 'Explain', query: `${ref}.find({}).explain()` }
  ]
}
