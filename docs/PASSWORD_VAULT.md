# Password Vault Manager

Local developer credential vault for Tessarok. Keeps database passwords, SSH keys, API keys, JWT secrets, SMTP/FTP credentials, and server logins inside the app — never in plaintext files or browser tabs.

## Architecture

```
Renderer (React)
  src/modules/password-vault/
    pages/VaultPage.tsx          — 3-panel layout (folders | list | detail)
    stores/vault.store.ts        — Zustand state + IPC calls
    components/                  — UI primitives
    hooks/useVaultKeyboard.ts    — Ctrl+N, Ctrl+C, Ctrl+Shift+F, Ctrl+L

Preload
  electron/preload/index.ts      — window.electronAPI.vault.*

Main process
  electron/main/ipc/vault.handlers.ts
  electron/main/services/vault.service.ts   — crypto session, business logic
  electron/main/repositories/vault.repository.ts
  electron/main/crypto/vault-crypto.ts    — Argon2id + AES-256-GCM
  electron/main/database/vault-schema.ts  — DDL + default folders

Shared contracts
  shared/types/vault.ts
  shared/ipc/channels.ts
  shared/ipc/api.ts
```

## Security model

| Layer | Implementation |
|-------|----------------|
| Master password | Argon2id hash stored in `VaultMeta`; never persisted in plaintext |
| Encryption key | Derived from master password + KDF salt (Argon2id raw, 32 bytes) |
| Credential fields | AES-256-GCM blob in `vault_items.encryptedData` |
| Session | Derived key held in main-process memory only while unlocked |
| Auto-lock | Configurable: 5 / 10 / 30 min or Never |
| Clipboard | Copy via IPC; auto-clears after 15 / 30 / 60 sec |
| Reveal | Decrypted values only on explicit Reveal/Copy IPC calls |

## Database schema

| Table | Purpose |
|-------|---------|
| `VaultMeta` | Master password hash, KDF salt, verification blob |
| `VaultSettings` | Auto-lock and clipboard preferences |
| `vault_folders` | Nested folder tree with drag-reorder support |
| `vault_items` | Credential metadata + encrypted payload |
| `vault_tags` | Tag definitions |
| `vault_item_tags` | Many-to-many item ↔ tag |
| `vault_history` | Password change history (encrypted) |
| `vault_favorites` | Pinned favorites ordering |
| `vault_activity_logs` | Audit trail (create, reveal, copy, import, etc.) |

### Encrypted payload fields

`username`, `password`, `url`, `notes`, `email`, `phone`, `api_key`, `secret_key`, `private_key`, `public_key`, `jwt_secret`, `database_username`, `database_password`, `ssh_username`, `ssh_password`, `token`

List/search uses plaintext previews (`title`, `urlPreview`, `usernamePreview`) for performance while unlocked.

## Default folders

Servers, Database, Production, Development, AWS, OpenAI, GitHub, Stripe, SMTP, Mongo, MySQL, Postgres, SSH, FTP, Redis — plus custom nested folders.

## Item types

Password, API Key, SSH, Database, Credit Card, License, Identity, Secure Note, Server, Custom

## IPC API (`window.electronAPI.vault`)

- **Lifecycle:** `getStatus`, `setup`, `unlock`, `lock`, `updateSettings`, `changeMasterPassword`
- **Folders:** `listFolders`, `createFolder`, `updateFolder`, `deleteFolder`, `reorderFolders`
- **Items:** `listItems`, `getItem`, `createItem`, `updateItem`, `archiveItem`, `restoreItem`, `trashItem`, `deleteItem`, `reorderItems`
- **Secrets:** `revealField`, `copyField` (never bulk-decrypt)
- **Search:** `search` — title, username, tags, URL, notes
- **Tools:** `generatePassword`, `generateApiKey`, `getDuplicates`, `getSecurityReport`, `getAiSuggestions`
- **Import/Export:** `export` (JSON, encrypted backup, CSV), `import` (JSON, encrypted, CSV, Bitwarden, 1Password, KeePass)
- **Integration:** `getProjectCredentials(projectId)` — for Database Studio, Terminal SSH, VPS Manager

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New credential |
| `Ctrl+C` | Copy password (when item selected) |
| `Ctrl+Shift+F` | Focus vault search |
| `Ctrl+L` | Lock vault |

## Project integration

Link credentials to projects via optional `projectId` on vault items. Other modules should call:

```typescript
const res = await window.electronAPI.vault.getProjectCredentials(projectId)
// Returns { itemId, title, itemType, username, url } — no secrets
```

To connect (e.g. Database Studio), request a specific field:

```typescript
await window.electronAPI.vault.revealField(itemId, 'databasePassword')
```

## AI features

While unlocked, the vault surfaces:

- Weak password detection
- Duplicate password groups
- Expired / stale credential rotation hints
- Exposed secrets in notes fields
- Stronger password and API key generation

## Route

Global route: **`/vault`** (sidebar → Password Vault)

## Biometric unlock

Not implemented in v1. `VaultSettings` and session architecture are designed so biometric unlock can wrap `unlock()` later without schema changes.
