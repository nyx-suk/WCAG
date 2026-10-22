# WCAG Accessibility Auditor

## Requirements

- Node.js 18 or newer.
- npm.

## Setup

```bash
npm install
npm run typecheck
npm test
```

The SQLite database defaults to `data/auditor.sqlite`. Persistence uses the
portable `sql.js` SQLite runtime. Set `DATABASE_PATH` to override the file
location.

## Current verification fixtures

- TC3 contrast fixture: `http://localhost:4000/tc3`
- TC4 keyboard fixture: `http://localhost:4000/tc4`

Run the fixture server with `npm run fixtures`. Findings are initially stored
as `pending_approval`; a reviewer must approve them before a retest can run.
Only a passing retest moves an issue to `resolved`. Failing or incomplete
retests return the issue to `approved_logged` with their evidence preserved.

Start the API with `npm start` (port `3000`, configurable with `PORT`). Run
`npm run fixtures` separately when auditing the local TC1-TC4 pages.

## API integration

`src/api/server.ts` exports `createAuditApp({ store, runAudit })`. The caller
must provide the existing `RunAudit` implementation; the API does not invent
findings or provide a mock production runner.

Routes:

- `POST /api/audits` — validate, execute, and persist an audit.
- `GET /api/audits` — list persisted audits with their issues.
- `GET /api/audits/:id/issues` — list issues for an audit.
- `POST /api/issues/:id/approve` — approve a pending issue.
- `POST /api/issues/:id/reject` — reject a pending issue.
- `POST /api/issues/:id/retest` — rerun the issue's relevant check and persist
  the retest; only a passing result resolves the issue.

The audit runner executes axe, keyboard trap, keyboard operability, and TC3
screenshot-pixel contrast checks. TC4 can be toggled between its broken and
fixed fixture states with the fixture server's `/__state/tc4` endpoint.
