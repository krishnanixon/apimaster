# Mock Server

Shurikly can run **local HTTP mock servers** from your collections. Mock configuration is stored in `mock-servers.json` under the app data folder.

## Defaults

- **Host:** `127.0.0.1` (local only)
- **Port:** `4010` or the next available port
- Servers stay **stopped** after restart until you start them again

## Workflow

1. Open **Mock Servers** in the title bar.
2. Create a server or use **Create Mock Server** on a collection in **Requests**.
3. Add or edit routes (method + path).
4. Configure responses (status, headers, body, delay). A route can hold several responses — add, duplicate, disable, or delete them in the route editor.
5. **Start** the server and call `http://127.0.0.1:<port>/...` from a browser, curl, or Shurikly.

## Examples from real responses

In **Requests**, send a request and open the response menu (chevron) → **Save as mock example**. The response's status, headers, and body are added to the route with the same method and path (or a new route is created). Transport headers such as `Content-Length`, `Set-Cookie`, and `Date` are dropped. `{{baseUrl}}` prefixes are ignored and `{{id}}` / `{id}` path segments become `:id` parameters.

## Choosing a response

Each route has a **response mode**:

| Mode | Behaviour |
|------|-----------|
| Active response (default) | Always serves the response marked active |
| Sequential | Rotates through enabled responses on each request |
| Random | Serves a random enabled response |

A client can pick a response for a single request with the `X-Mock-Response` header or the `__response` query parameter, matching the response **id**, **name** (case-insensitive), or **status code**:

```bash
curl -H "X-Mock-Response: Not found" http://127.0.0.1:4010/users/1
curl "http://127.0.0.1:4010/users/1?__response=404"
```

An unknown value returns `400` with the list of available response names. Served responses carry an `X-Mock-Response` header with the (URL-encoded) response name, and the request log shows it too.

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
