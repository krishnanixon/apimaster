import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer } from '../shared/lib/code-scanner/analyzer'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'

function analyze(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

const summary = (files: Record<string, string>) =>
  analyze(files)
    .endpoints.map((e) => `${e.method} ${e.path}${e.securityRequired ? ' 🔒' : ''}`)
    .sort()

// Shapes found in real projects where the scanner used to drop prefixes, merge unrelated routes or miss auth.
describe('code scanner — router mounting', () => {
  it('follows require(path.join(__dirname, …)) and keeps mount prefixes apart', () => {
    expect(
      summary({
        'src/router.js': `
          const express = require("express");
          const path = require("path");
          const router = express.Router();
          const terms = require(path.join(__dirname, "./routes/terms/index.js"));
          const users = require(path.join(
            __dirname,
            "./routes/super-admin/users.js"
          ));
          const home = require(\`\${__dirname}/routes/home.js\`);
          router.use("/terms", terms);
          router.use("/super-admin/users", users);
          router.use(home);
          module.exports = router;`,
        'src/server.js': `
          const express = require("express");
          const app = express();
          app.use(require(require("path").resolve(__dirname, "router.js")));`,
        'src/routes/terms/index.js': `
          const router = require("express").Router();
          router.get("/", list);
          router.put("/:version", update);
          module.exports = router;`,
        'src/routes/super-admin/users.js': `
          const router = require("express").Router();
          router.get("/", list);
          router.put("/:userId", update);
          module.exports = router;`,
        'src/routes/home.js': `
          const router = require("express").Router();
          router.get("/home", h);
          module.exports = router;`
      })
    ).toEqual(['GET /home', 'GET /super-admin/users', 'GET /terms', 'PUT /super-admin/users/:userId', 'PUT /terms/:version'])
  })

  it('mounts router factories whose argument is named app, once per mount', () => {
    expect(
      summary({
        'src/index.ts': `
          import express from "express";
          import { requireDoctor, requirePatient } from "./middleware/auth.js";
          import { createNotificationsRouter } from "./routes/notifications.js";
          const app = express();
          app.use("/api/v1/doctor/notifications", requireDoctor, createNotificationsRouter("doctor"));
          app.use("/api/v1/patient/notifications", requirePatient, createNotificationsRouter("user"));`,
        'src/routes/notifications.ts': `
          import { Router } from "express";
          import type { SessionApp } from "./types.js";
          export function createNotificationsRouter(app: SessionApp) {
            const router = Router();
            router.get("/", list);
            router.post("/devices", register);
            return router;
          }`,
        'src/middleware/auth.ts': `export const requireDoctor = () => {}; export const requirePatient = () => {};`
      })
    ).toEqual([
      'GET /api/v1/doctor/notifications 🔒',
      'GET /api/v1/patient/notifications 🔒',
      'POST /api/v1/doctor/notifications/devices 🔒',
      'POST /api/v1/patient/notifications/devices 🔒'
    ])
  })

  it('mounts an imported router even when its name sounds like auth middleware', () => {
    const files = {
      'src/app.js': `
        const express = require("express");
        const authentication = require("./routes/authentication");
        const requireAuth = require("./middleware/requireAuth");
        const app = express();
        app.use("/auth", authentication);
        const api = express.Router();
        api.use(requireAuth);
        api.get("/me", me);
        app.use("/api", api);`,
      'src/routes/authentication.js': `
        const router = require("express").Router();
        router.post("/login", login);
        module.exports = router;`,
      'src/middleware/requireAuth.js': `module.exports = function requireAuth(req, res, next) { next() }`
    }
    expect(summary(files)).toEqual(['GET /api/me 🔒', 'POST /auth/login'])
  })

  it('reads bodies validated with schema.safeParse(req.body ?? {})', () => {
    const { endpoints } = analyze({
      'src/index.ts': `
        import express from "express";
        import { z } from "zod";
        const app = express();
        const deviceSchema = z.object({ token: z.string(), platform: z.enum(["android", "ios"]) });
        app.post("/devices", (req, res) => {
          const parsed = deviceSchema.safeParse(req.body ?? {});
          res.json(parsed);
        });`
    })
    expect(endpoints[0].requestBody?.example).toEqual({ token: '', platform: 'android' })
  })

  it('does not treat request-shape checks as auth', () => {
    expect(
      summary({
        'src/index.js': `
          const express = require("express");
          const app = express();
          app.post("/a", requireJson, h);
          app.post("/b", requireRole("admin"), h);`
      })
    ).toEqual(['POST /a', 'POST /b 🔒'])
  })
})

describe('code scanner — import counts', () => {
  it('builds exactly one request per endpoint unless validation tests are asked for', () => {
    const { endpoints } = analyze({
      'src/index.ts': `
        import express from "express";
        import { z } from "zod";
        const app = express();
        const user = z.object({ email: z.string().email(), name: z.string().min(2) });
        app.post("/users", (req, res) => res.json(user.parse(req.body)));
        app.get("/users", list);
        app.get("/users/:id", one);`
    })
    const plain = buildCollectionFromEndpoints(endpoints, { name: 'x', baseUrl: 'http://localhost' }).collection
    expect(plain.requests).toHaveLength(endpoints.length)
    const withTests = buildCollectionFromEndpoints(endpoints, { name: 'x', baseUrl: 'http://localhost', validationTests: true }).collection
    const tests = withTests.requests.filter((r) => r.scan?.key.includes('#validation:'))
    expect(withTests.requests.length - tests.length).toBe(endpoints.length)
    expect(tests.length).toBeGreaterThan(0)
  })
})
