# AI Engineer (Phase 1)

AI Engineer turns Shurikly into an API analysis and testing workflow while reusing the existing HTTP client, environments, and collections.

## What works without an AI provider

- Structural **API analysis** from a collection or OpenAPI JSON
- **Baseline test generation** (reachability + missing-auth probes)
- **Test execution** through the same path as Collection Runner (`prepareRequest` → IPC → main-process HTTP)
- Assertions and **evidence-backed** results

## What requires an AI provider

When **Send API data to AI provider** is enabled (sanitized via `redact-secrets`):

- Narrative API summary after analysis
- Additional functional, edge, and auth tests
- **Failure analysis** explanations for failed runs

Default: **Send API data to AI provider** is **off**.

## Execution safety

- GET/HEAD/OPTIONS low-risk tests can run with **Run safe tests**
- POST/PUT/PATCH/DELETE tests are skipped unless you use **Run all (approved)**

## Storage

`ai-engineer.json` in app user data holds analyses, suites, runs, findings, and privacy settings.

## Phase 2 (planned)

Security scan module, API diff, conversational agent, documentation export.
