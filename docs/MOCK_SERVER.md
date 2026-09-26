# Mock Server

APIMaster can run **local HTTP mock servers** from your collections. Mock configuration is stored in `mock-servers.json` under the app data folder.

## Defaults

- **Host:** `127.0.0.1` (local only)
- **Port:** `4010` or the next available port
- Servers stay **stopped** after restart until you start them again

## Workflow

1. Open **Mock Servers** in the title bar.
2. Create a server or use **Create Mock Server** on a collection in **Requests**.
3. Add or edit routes (method + path).
4. Configure responses (status, headers, body, delay).
5. **Start** the server and call `http://127.0.0.1:<port>/...` from a browser, curl, or APIMaster.

## Route matching

- Paths support `:parameters`, e.g. `GET /users/:id`.
- **Static segments win** over parameters (`/users/me` before `/users/:id`).
- Query strings are ignored for matching but available in templates.

## Templates

Use in response bodies:

| Variable | Meaning |
|----------|---------|
| `{{params.id}}` | Path parameter |
| `{{query.page}}` | Query parameter |
| `{{headers.authorization}}` | Request header |
| `{{body.name}}` | JSON request body field |
| `{{method}}`, `{{path}}`, `{{host}}` | Request metadata |

Missing values render as an empty string.

## CORS

Enable CORS per mock server for browser clients. `OPTIONS` requests return `204` with configured `Access-Control-*` headers.

## Troubleshooting

**Port already in use:** Stop the other process or change the mock server port, then start again.

**405 Method Not Allowed:** Another route matches the path but not the HTTP method; check the `Allow` header.

**Invalid JSON:** JSON response bodies are validated before save when `bodyType` is `json`.
