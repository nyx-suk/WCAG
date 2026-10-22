# Audit Engine Interface Contract

## 1. Import
```ts
import { runAudit, type AuditInput, type AuditResult, type AuditFinding, ValidationError } from "./engine";
```

## 2. Types & Data Shapes
- `Severity`: `"critical" | "serious" | "moderate" | "minor"`
- `CheckId`: `"axe" | "keyboard-trap" | "keyboard-operability" | "contrast"`
- `CheckStatus`: `"executed" | "failed" | "skipped"`
- `AuditInput`: `{ url: string; wcagLevel: "A" | "AA" | "AAA"; auditId: string; checks?: CheckId[] }`
- `AuditFinding`: `{ title: string; description: string; wcagRule: string; severity: Severity; source: CheckId; checkId: CheckId; fingerprint: string; selector?: string; screenshot?: string; recording?: string; evidence: unknown }`
- `AuditResult`: `{ auditId: string; url: string; status: "complete" | "incomplete" | "error"; findings: AuditFinding[]; checksPlanned: CheckId[]; checksExecuted: { checkId: CheckId; status: CheckStatus; error?: string }[]; axeSummary?: { violationCount: number; passesCount: number; incompleteCount: number }; startedAt: string; completedAt: string }`

## 3. Status Lifecycle & Validation
- Validation: invalid input rejects with `ValidationError` before browser launch.
- `complete`: all planned checks executed successfully.
- `incomplete`: audit ran, but $\ge 1$ check failed or was skipped.
- `error`: initial navigation failed (e.g., HTTP status $\ge 400$, 404, or network failure).

## 4. Fingerprinting & Retest Criteria
- `makeFingerprint(checkId, url, selector)`: 16 hex chars (SHA-256), URL hashes stripped. Axe uses `${ruleId}|${firstNodeSelector}`; contrast uses sampled selector.
- Retest Pass Rule: a retest passes ONLY if `runAudit({ ...original, checks: [original.checkId] })` returns `status: "complete"`, that check has `status: "executed"`, and no finding matches the original `fingerprint`. `incomplete` or `error` never pass.

## 5. Evidence Artifacts
Stored on disk under `/evidence/{auditId}/...`. Finding `screenshot` and `recording` fields store paths relative to `/evidence` (e.g. `{auditId}/keyboard-trap.png`).

## 6. Fixture State Management (TC2)
- Set state: `POST /__state/tc2` with `{"fixed": true}` or `{"fixed": false}`.
- Reset fixtures: `POST /__state/reset`.

## 7. Known Engine Limitations
- Axe AAA coverage is partial per axe-core rule definitions.
- Keyboard operability discovery is heuristic and inspects visible controls.
- Keyboard checks cover only the checks that were planned and executed.
