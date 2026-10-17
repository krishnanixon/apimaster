# Collection files

A Shurikly collection can live as plain YAML files in a folder you choose, for example a `api/` folder inside your git repo. Each request is its own file, so changes show up as small, readable diffs and merge like code.

Collections that are not linked to a folder are stored as before, in the encrypted workspace file in the app data folder.

## Workflow

- **Save an existing collection to a folder:** right-click the collection (or use its **⋯** menu) → **Save to folder…**. Pick an empty folder, or a folder such as your repo root: if it already has other files in it, Shurikly creates a subfolder named after the collection.
- **Open a collection folder:** click the folder icon at the top of the collection sidebar (**Open folder as collection**) and pick a folder that contains `shurikly.collection.yaml`.
- **Show folder**, **Reload from folder**, **Move to another folder…**, and **Stop syncing to folder** are in the same menu. Stopping keeps the collection in Shurikly and leaves the files on disk.
- Deleting a linked collection removes it from Shurikly only. Its files stay on disk.

### Saving and live reload

- Changes are written about half a second after you make them. Each file is written to a temporary file and renamed into place, so a crash never leaves a half-written file. Only files whose content changed are rewritten.
- Shurikly watches the folder. When files change outside the app (`git pull`, `git checkout`, an editor), the collection reloads:
  - Open tabs with unsaved edits keep their drafts. Clean tabs show the new version.
  - If the collection has local changes that have not been written yet, nothing is replaced. A prompt asks you to **Load from disk** or **Keep mine** (which overwrites the folder with your version).
- A file that fails to parse (a merge conflict marker, a typo) is reported with a warning icon on the collection and skipped. Every other request still loads. Shurikly never overwrites or deletes a file it could not read, so you can fix it in your editor; it loads on the next save.
- If `shurikly.collection.yaml` itself is missing or unreadable, or the folder has been moved, saving pauses and the warning icon explains why. The last loaded copy stays usable.

## Layout

```
payments-api/
  shurikly.collection.yaml        collection settings and order
  README.md                       created once, yours to edit
  health-check.request.yaml       a request at the collection root
  users/                          a folder
    shurikly.folder.yaml          folder settings and order
    create-user.request.yaml
    admin/                        a nested folder
      shurikly.folder.yaml
      list-admins.request.yaml
  environments/
    staging.yaml
    production.yaml
```

- File and folder names are made from the item's name: lowercase, `a-z 0-9 -`, at most 60 characters. Two siblings with the same name get `-2`, `-3`, …. Renaming a request in Shurikly renames its file.
- Every item keeps its `id` in the file, so a renamed or moved file still refers to the same request (open tabs, history, mock servers, and Code Scanner links keep working).
- `folders` and `requests` lists in `shurikly.collection.yaml` and `shurikly.folder.yaml` give the display order. Items not listed (for example a file you added by hand) come after, sorted by name.
- Only `shurikly.collection.yaml`, `shurikly.folder.yaml`, `*.request.yaml`, and `environments/*.yaml` belong to Shurikly. Other files in the folder (README, code, `.git`) are never touched. Hidden folders and `node_modules` are skipped.

## Files

Output is deterministic: fixed key order, 2-space indentation, no line wrapping, and multi-line text (bodies, scripts, docs) as YAML block scalars. Saving the same collection twice gives identical bytes. Empty values are left out, and there are no timestamps, so a file changes only when its content does.

### `shurikly.collection.yaml`

```yaml
formatVersion: 1
id: 6f1c…                 # stable id
name: Payments API
description: Charges and refunds
auth:                      # inherited by folders and requests with `auth: { type: inherit }`
  type: bearer
  bearerToken: '{{token}}'
headers:                   # merged into every request
  - key: Accept
    value: application/json
scripts:
  preRequest: |
    pm.environment.set("ts", Date.now())
folders:                   # order of top-level folders (folder names on disk)
  - users
requests:                  # order of top-level requests (file names without .request.yaml)
  - health-check
```

### `shurikly.folder.yaml`

`id`, `name`, `auth`, `headers`, `scripts.preRequest`, `folders`, `requests` — same meaning as above. A subfolder without this file is still read as a folder named after the directory.

### `<name>.request.yaml`

```yaml
id: 1b2c…
name: Create user
type: http                 # http | graphql | websocket (omitted on older requests)
method: POST
url: '{{baseUrl}}/users/:id'
timeoutMs: 5000
params:                    # query parameters
  - key: page
    value: '1'
pathParams:
  - key: id
    value: '42'
headers:
  - key: Content-Type
    value: application/json
  - key: X-Debug
    value: '1'
    enabled: false         # only written when false
    description: Verbose logs
body:
  type: json               # none | json | text | form-data | x-www-form-urlencoded
  content: |-
    {
      "name": "Ada"
    }
auth:
  type: inherit
graphql:                   # GraphQL requests only
  query: |-
    query Viewer { viewer { id } }
  variables: '{}'
  operationName: Viewer
scripts:
  preRequest: |
    console.log("before")
  tests: |
    pm.test("created", () => pm.response.to.have.status(201))
docs: |                    # the request's notes
  Creates a user.
```

Form-data file fields keep `fileName` and `fileContentType`; the file bytes are not written (attach the file again on another machine). The cached GraphQL schema is not written either; it is fetched again on demand.

### `environments/<name>.yaml`

```yaml
id: 9a8b…
name: Staging
variables:
  - key: baseUrl
    value: https://staging.example.com
  - key: token
    secret: true           # value kept on this machine only
```

In the environment editor, choose where an environment is stored: **This machine only** (the default) or **Folder of “Collection”**. Environments in a collection folder are loaded with it.

## Secrets

Secret values are never written to a collection folder. Their keys are written so a teammate knows what to fill in, and each person's values stay in their own encrypted Shurikly workspace. A value is treated as secret when:

- it is marked secret with the lock toggle (`secret: true`). The lock is shown on environment variables, and on request headers and query parameters in folder-linked collections, or
- its key looks like a credential and the value is a literal: `Authorization`, `Proxy-Authorization`, `Cookie`, `X-Api-Key`, `Api-Key`, `X-Auth-Token`, `X-Access-Token`, and names containing `password`, `passwd`, `secret`, `apiKey`/`api_key`, `accessKey`, `privateKey`, `credential`, or ending in `token`. Names such as `tokenUrl` or `sessionId` are shared. Click the lock to share a value that was matched by mistake (`secret: false`), or
- it is an auth credential with a literal value: bearer token, basic/digest password, API key value, JWT secret, OAuth 1.0 consumer/token secrets, OAuth 2.0 client secret, password, access and refresh tokens, AWS secret key and session token, Hawk key.

A value made only of `{{variable}}` references (optionally after `Bearer `, `Basic ` or `Token `) is not a secret and is written as is. The recommended setup is to reference secrets as `{{token}}` in requests and keep the value in a secret environment variable.

Not covered: URLs, request bodies, and scripts are written as they are. Don't paste credentials into them; use a `{{variable}}`.

Nothing in a collection folder needs to be git-ignored.

## Format version and migrations

`formatVersion` in `shurikly.collection.yaml` is the format of the whole folder (currently `1`). A folder with a newer version is not opened, and Shurikly asks you to update. When the format changes, the version is bumped and a migration step is added to `MIGRATIONS` in `shared/lib/collection-files/format.ts`; older folders are upgraded in memory when read and written in the new format on the next save.

## Using the format outside the app

The format code is in `shared/lib/collection-files/` and does not depend on Electron:

- `serializeCollection(collection, environments)` → `{ [relativePath]: text }` (pure)
- `parseCollectionFiles(files, { previous? })` → `{ collection, environments, errors, fatal? }` (pure; a broken file is listed in `errors` and skipped)
- `node.ts`: `readCollectionDirectory(path)`, `loadCollectionDirectory(path)`, and `writeCollectionDirectory(path, files)` for Node.js.

A command-line runner can load a folder with `loadCollectionDirectory` and run it without the app.
