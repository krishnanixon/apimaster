/**
 * Collections as readable files. Everything exported here is pure (no fs, no Electron);
 * `./node` adds the file-system read/write for Node callers.
 */
export * from './format'
export * from './secrets'
export { serializeCollection, type SerializeOptions } from './serialize'
export {
  parseCollectionFiles,
  type CollectionFileError,
  type ParseOptions,
  type ParsedCollectionFolder
} from './parse'

/** Created once next to a new collection folder and never rewritten, so users can edit it. */
export function collectionReadme(name: string): string {
  return `# ${name}

This folder is a [Shurikly](https://github.com/shurikly/shurikly) API collection. Each request is a
\`*.request.yaml\` file, folders are subfolders, and \`shurikly.collection.yaml\` holds collection settings.
Open it in Shurikly with **Open folder as collection**. The format is described in
[COLLECTION_FILES.md](https://github.com/shurikly/shurikly/blob/main/docs/COLLECTION_FILES.md).

Secrets are not stored here. Variables marked secret, credential headers, and auth tokens are written
without their values; each person's values stay in their local, encrypted Shurikly workspace. Use
\`{{variables}}\` for anything you want to share.

Nothing in this folder needs to be git-ignored.
`
}
